# Quick Start: Task & Calendar System

## 5-Minute Setup

### Step 1: Database Setup (2 minutes)

1. Open your Supabase Dashboard at https://app.supabase.com
2. Go to **SQL Editor** → **New Query**
3. Open `TASK_CALENDAR_SCHEMA.sql` from your project
4. Copy the entire file contents
5. Paste into SQL Editor
6. Click **Run** or press `Cmd/Ctrl + Enter`
7. Wait for "Success" message

### Step 2: Verify Tables (1 minute)

1. Go to **Table Editor** in Supabase
2. Verify these tables exist:
   - ✅ task_lists
   - ✅ tasks
   - ✅ subtasks
   - ✅ calendar_events
   - ✅ recurrence_patterns
   - ✅ tags
   - ✅ task_tags
   - ✅ event_tags
   - ✅ reminders
   - ✅ time_entries

### Step 3: Start Using (2 minutes)

1. **Start your app**:
   ```bash
   npm run tauri:dev
   ```

2. **Access the Task System**:
   - Press `Cmd/Ctrl + \` to open the UnifiedPanel
   - Click the **Tasks** tab
   - Click **"Open Tasks & Calendar"**

## First Tasks to Try

### Create Your First Task

1. In UnifiedPanel → Tasks tab
2. Type in "Quick Add" field: `Set up task management`
3. Press Enter
4. ✅ Done!

### Create a Detailed Task

1. Click **"Open Tasks & Calendar"**
2. Click **"New Task"** button
3. Fill in:
   - Title: `Review project documentation`
   - Description: `Go through all setup guides`
   - Priority: `High`
   - Due Date: Tomorrow
4. Click **"Create Task"**

### Create a Calendar Event

1. In Task & Calendar Modal
2. Click **"New Event"**
3. Fill in:
   - Title: `Team Meeting`
   - Start: Tomorrow at 10 AM
   - End: Tomorrow at 11 AM
   - Location: `Zoom`
4. Click **"Create Event"**

### Switch Views

Click the view mode buttons at the top:
- **Tasks** - See all your tasks with filters
- **Calendar** - Month view of events and tasks
- **Timeline** - Chronological upcoming events

## Common Actions

### Complete a Task
- Click the circle icon next to any task
- It turns into a green checkmark ✅

### Star a Task
- Click the star icon to mark as important ⭐

### Start Tracking Time
- Click the play button ▶️ on a task
- Timer starts automatically
- Click stop ⏹️ when done

### Filter Tasks
Use the sidebar filters:
- **Due Today** - Tasks due today
- **This Week** - Next 7 days
- **Overdue** - Past due tasks
- **Starred** - Your favorites
- **Completed** - Finished tasks

## Keyboard Shortcuts

- `Cmd/Ctrl + \` - Toggle UnifiedPanel
- `Enter` - Submit quick task (when input focused)
- `Escape` - Close modals

## Tips & Tricks

1. **Link Tasks to Notes**:
   - Create tasks while viewing a note
   - They'll be automatically linked
   - View them in the Tasks tab

2. **Use Priorities**:
   - Urgent (red) - Do immediately
   - High (orange) - Important
   - Medium (blue) - Normal
   - Low (gray) - When you have time

3. **Quick Stats**:
   - See todo/in-progress/completed counts
   - Spot overdue tasks immediately
   - Track productivity at a glance

4. **Calendar Navigation**:
   - Click **Today** to jump to current date
   - Use arrows to navigate months
   - Click any day to see details

5. **Time Management**:
   - Estimate time for tasks
   - Track actual time spent
   - Review time entries

## Troubleshooting

**Tasks not showing?**
- Check database schema was run
- Verify you're logged in
- Check browser console for errors

**Can't create tasks?**
- Verify Supabase connection
- Check RLS policies are enabled
- Ensure all required fields filled

**Calendar empty?**
- Check you've created events
- Verify date range
- Try clicking "Today" button

## Next Steps

1. ✅ Create a few test tasks
2. ✅ Try different filters
3. ✅ Create a calendar event
4. ✅ Start a time tracker
5. ✅ Link tasks to notes
6. ✅ Explore the stats dashboard

## Need Help?

- Read **TASK_CALENDAR_GUIDE.md** for detailed docs
- Check **TASK_CALENDAR_IMPLEMENTATION.md** for technical details
- Review code comments in `lib/tasks.ts` and `lib/events.ts`

## Success!

You now have a powerful task and calendar management system integrated with your notes! 🎉

Start organizing your work and tracking your time like a pro! 💪
