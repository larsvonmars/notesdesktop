# 🔄 Adding Existing Tasks to Kanban Board

## The Issue

When you first set up the Kanban board, your existing tasks won't automatically appear on it. Tasks need to be explicitly added to the board with their column positions.

## Quick Fix: Use the Sync Button

1. Open the Task & Calendar modal
2. Click the **"Kanban"** tab
3. Click the **"Sync Tasks"** button in the top-right corner
4. All your existing tasks will be added to the board in the appropriate columns based on their status

## How It Works

The sync function:
- Finds all your existing tasks
- Checks which ones aren't on the board yet
- Adds them to the appropriate column based on their status:
  - `todo` → "To Do" column
  - `in_progress` → "In Progress" column
  - `waiting` → "Review" column
  - `completed` → "Done" column
- Places them at the end of each column

## Automatic Addition for New Tasks

Going forward, any new task you create will automatically be added to the Kanban board's first column ("To Do").

## Manual Method (via Console)

If you prefer to use the browser console:

```javascript
// Import and run the sync function
import { addAllTasksToDefaultBoard } from '@/lib/kanban-utils'
await addAllTasksToDefaultBoard()
```

## What Happens

Before sync:
- ❌ Tasks exist but don't show on Kanban board
- ✅ Tasks visible in "Tasks" tab

After sync:
- ✅ Tasks appear in Kanban columns
- ✅ Organized by their current status
- ✅ Can be dragged between columns

## Why This Happens

The Kanban system uses a separate `kanban_task_positions` table to track:
- Which board a task is on
- Which column it's in
- What position within the column

This allows:
- Multiple boards per user
- Same task on different boards
- Precise drag-and-drop ordering

## Future Improvements

In a future update, we could:
- Auto-add tasks to default board on creation
- Show "orphaned" tasks with an "Add to Board" button
- Bulk import/export between boards
- Task assignment rules

## Troubleshooting

**Sync button doesn't work?**
- Check browser console for errors
- Verify you're logged in
- Ensure database schema is applied correctly

**Tasks still not showing?**
- Refresh the page
- Check the task's status matches a column
- Look in the database: `kanban_task_positions` table

**Duplicates appearing?**
- The sync function checks for existing positions
- It won't add tasks that are already on the board
- Safe to run multiple times

---

**TL;DR**: Click the "Sync Tasks" button on the Kanban board to add all your existing tasks! 🚀
