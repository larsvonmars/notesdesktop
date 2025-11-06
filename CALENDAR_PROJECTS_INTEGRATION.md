# Calendar-Projects Integration

## Overview
Calendar events can now be linked to projects, allowing you to organize and filter events by project. This integration provides better organization and visibility of project-related deadlines and meetings.

## What's New

### 1. Project Linking in Events
- Events can be associated with a specific project
- Project dropdown selector in event form
- Optional - events don't require a project

### 2. Project Filter
- Filter calendar view by project
- Show all events
- Show only events without a project
- Show events for a specific project
- Filter applies to both calendar and list views

### 3. Visual Project Indicators
- Project name and color shown in event listings
- Project badge in list view
- Project badge in upcoming events sidebar
- Project icon (target) for quick identification

## Features

### Creating Events with Projects

1. **Open Event Form**
   - Click "New Event" button
   - Click on a date in calendar view

2. **Select Project** (optional)
   - Use the "Project" dropdown in the event form
   - Choose from your existing projects
   - Or select "No Project" to leave unlinked

3. **Auto-Fill from Filter**
   - If you're filtering by a specific project, new events will automatically be assigned to that project
   - You can change this in the form if needed

### Filtering Events by Project

1. **Open Filter Menu**
   - Click the "Filter" button (between view toggle and "New Event")
   - Shows current filter status

2. **Select Filter**
   - **All Events**: Show all calendar events (default)
   - **No Project**: Show only events not linked to any project
   - **[Project Name]**: Show only events for that specific project

3. **Filter Indicator**
   - Button shows current filter selection
   - Purple highlight when a filter is active
   - Project color dot for project-specific filters

### Viewing Project Information

**List View:**
- Project name appears with target icon
- Project color applied to project name
- Located in event metadata row

**Upcoming Events Sidebar:**
- Project badge below date/time
- Compact display with icon
- Color-coded project name

**Event Form:**
- Project dropdown showing all projects
- Current selection displayed below dropdown
- Shows "Linked to: [Project Name]" when selected

## Database Schema

### Migration
A new column `project_id` has been added to the `calendar_events` table:

```sql
ALTER TABLE public.calendar_events
ADD COLUMN project_id uuid;

ALTER TABLE public.calendar_events
ADD CONSTRAINT calendar_events_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES public.projects(id) 
ON DELETE SET NULL;
```

### Table Structure
```sql
calendar_events:
  - id (uuid, primary key)
  - title (text)
  - description (text)
  - start_date (timestamp with time zone)
  - end_date (timestamp with time zone)
  - all_day (boolean)
  - color (text)
  - user_id (uuid, references auth.users)
  - note_id (uuid, references notes)
  - project_id (uuid, references projects) ← NEW
  - created_at (timestamp)
  - updated_at (timestamp)
```

## Technical Implementation

### Files Modified

**1. `/lib/calendar.ts`**
- Added `project_id` to `CalendarEvent` interface
- Added `project_id` to `CreateCalendarEventData` interface
- Added `project_id` to `UpdateCalendarEventData` interface
- Added `getCalendarEventsByProject()` function for filtering

**2. `/components/CalendarModal.tsx`**
- Added project state and loading
- Added `getProjects()` import
- Added `filterProjectId` state for filtering
- Added `showProjectFilter` state for dropdown
- Updated `formData` interface with `project_id`
- Updated event creation/update to include `project_id`
- Added project filter UI component
- Added project selector in event form
- Added project badges in list view
- Added project badges in upcoming events
- Auto-fill project from filter when creating new events

### New Functions

**`getCalendarEventsByProject(projectId: string | null)`**
```typescript
// Get all events for a specific project
// Pass null to get events with no project
const events = await getCalendarEventsByProject(projectId)
```

### UI Components

**Project Filter Dropdown:**
- Located in toolbar between view toggle and "New Event"
- Dropdown menu with all projects
- Special options: "All Events" and "No Project"
- Visual indicator of current filter
- Project color dots for easy identification

**Project Selector in Form:**
- Standard select dropdown
- Shows all available projects
- "No Project" option at top
- Confirmation text below when project selected
- Uses Target icon for visual consistency

**Project Badges:**
- Target icon (🎯) for project indicator
- Project name in project color
- Compact, non-intrusive design
- Consistent across all views

## Use Cases

### 1. Project Deadline Tracking
- Link milestones and deadlines to projects
- Filter calendar to see only project deadlines
- Color-code by project for quick identification

### 2. Meeting Organization
- Link team meetings to their respective projects
- View all meetings for a specific project
- Track project-related events separately

### 3. Multi-Project Management
- Separate events by project
- Quick switch between project calendars
- See cross-project schedule in "All Events" view

### 4. Personal vs. Work Events
- Create a "Personal" project for personal events
- Keep work projects separate
- Filter to see only personal or only work events

## Workflow Examples

### Example 1: Creating a Project Event
```
1. Open Calendar modal
2. Filter by "Marketing Campaign" project
3. Click "New Event"
4. Event is auto-assigned to "Marketing Campaign"
5. Add title: "Campaign Launch"
6. Set date and time
7. Save
```

### Example 2: Filtering Events
```
1. Open Calendar modal
2. Click "Filter" button
3. Select "Website Redesign" project
4. View calendar showing only redesign events
5. Switch to list view for detailed timeline
6. Check upcoming events sidebar for next deadlines
```

### Example 3: Moving Event to Different Project
```
1. Click on an event
2. In edit form, change project dropdown
3. Select different project or "No Project"
4. Save changes
5. Event now appears when filtering by new project
```

## Benefits

✅ **Better Organization**: Group events by project context
✅ **Improved Focus**: Filter to see only relevant events
✅ **Visual Clarity**: Color-coded projects for quick scanning
✅ **Flexible Workflow**: Events can exist with or without projects
✅ **Consistent Experience**: Same project system as notes and folders
✅ **Quick Filtering**: One-click project filter switching
✅ **Auto-Assignment**: Smart defaults based on current filter

## Migration Instructions

### For Existing Users

1. **Run the Migration**
   - Execute `migrations/add_project_to_calendar_events.sql` in Supabase SQL editor
   - This adds the `project_id` column to existing table
   - No data loss - existing events remain unchanged
   - Foreign key constraint ensures data integrity

2. **Update Existing Events** (optional)
   - Open Calendar modal
   - Edit each event you want to link to a project
   - Select project from dropdown
   - Save

3. **No Action Required**
   - Existing events work fine without projects
   - Project linking is completely optional
   - Events without projects show in "All Events" and "No Project" filters

### For New Installations

- The migration is included in setup
- Schema already includes `project_id` column
- No additional steps needed

## Tips & Best Practices

### Organization Tips
1. **Create project-specific events**: Link deadlines, milestones, and meetings to projects
2. **Use consistent colors**: Match event color to project color for visual coherence
3. **Regular reviews**: Filter by project weekly to review upcoming project events
4. **Combine with notes**: Use same projects for both notes and events

### Filtering Strategies
1. **Start broad**: Begin with "All Events" to see full schedule
2. **Focus when needed**: Filter to specific project for focused planning
3. **Check "No Project"**: Regularly review unlinked events and categorize them
4. **Multi-view approach**: Use calendar view for overview, list view for details

### Event Naming
- Include project context in title when helpful: "[Project] - Event Name"
- Use descriptions to link to relevant notes or details
- Keep titles concise for calendar grid readability

## Troubleshooting

**Filter not working?**
- Close and reopen the calendar modal
- Verify the filter dropdown shows your selection
- Check that events actually belong to that project

**Project not showing in dropdown?**
- Ensure project exists in Project Manager
- Refresh the calendar modal
- Check that you have access to the project

**Can't remove project from event?**
- Select "No Project" from dropdown
- This sets project_id to null
- Event will appear in "No Project" filter

## Future Enhancements

Potential improvements:
1. **Quick Add from Project Manager**: Create events directly from project view
2. **Project Calendar Widget**: Embedded calendar in Project Manager
3. **Event Templates**: Pre-configured event types for common project milestones
4. **Bulk Operations**: Assign multiple events to a project at once
5. **Project Timeline View**: Gantt-style view of project events
6. **Event Statistics**: Count events per project, upcoming deadlines per project
7. **Smart Suggestions**: Suggest project based on event title/description
8. **Calendar Export by Project**: Export project-specific calendar to iCal

## Related Features

- **Project Manager**: Manage projects that events can link to
- **Note Projects**: Notes can also be linked to projects
- **Folder Projects**: Folders can belong to projects
- **Unified Project View**: See all project resources (notes, folders, events) together

## Summary

The Calendar-Projects integration brings powerful organization to your calendar events. By linking events to projects, you can:
- Filter your calendar by project
- See project deadlines in context
- Organize events alongside project notes and folders
- Maintain focus on specific project timelines

The feature is optional, flexible, and designed to enhance your workflow without adding complexity. Start using it today to bring better structure to your project planning!
