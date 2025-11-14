# Task & Calendar Enhancements - Kanban Board & Enhanced Task Features

## 🎉 What's New

This update adds powerful new features to your task management system:

1. **Kanban Board View** - Visual drag-and-drop task organization
2. **Enhanced Task Details** - Links, colors, cover images, attachments, labels
3. **Custom Kanban Columns** - Create your own workflow stages
4. **Task Progress Tracking** - Visual progress indicators
5. **Board Management** - Multiple boards for different projects

## 📦 Installation Steps

### 1. Install Dependencies

The system uses `@dnd-kit` for drag-and-drop functionality (already installed):

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 2. Run Database Migrations

**IMPORTANT**: Run these SQL files in order:

#### First: Run the cleanup script (if you've already created tables)

```sql
-- File: TASK_CALENDAR_CLEANUP.sql
-- Run this first to remove any existing tables
```

#### Second: Run the main schema

```sql
-- File: TASK_CALENDAR_SCHEMA.sql
-- Run this to create all base tables
```

#### Third: Run the enhancements schema

```sql
-- File: TASK_CALENDAR_ENHANCEMENTS.sql
-- Run this to add Kanban features and enhanced task fields
```

**To run in Supabase:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy the entire contents of each file (in order)
3. Paste and click "Run"

## 🎨 New Features Overview

### Enhanced Task Fields

Tasks now support rich metadata:

- **Links**: Array of URLs with titles and descriptions
- **Color**: Custom color for each task
- **Cover Image**: Visual cover for tasks
- **Attachments**: Files, images, documents
- **Custom Fields**: Flexible key-value metadata
- **Progress**: 0-100% completion indicator
- **Labels**: Quick visual tags (like "#urgent", "#design")

### Kanban Board System

#### Board Structure

```
Board (e.g., "My Project Board")
  ├── Column: "To Do" (maps to status: 'todo')
  ├── Column: "In Progress" (maps to status: 'in_progress')
  ├── Column: "Review" (maps to status: 'waiting')
  └── Column: "Done" (maps to status: 'completed')
```

#### Features

- **Drag & Drop**: Move tasks between columns
- **Auto-Status Updates**: Tasks automatically update status when moved
- **Column Limits**: Set WIP (Work In Progress) limits per column
- **Multiple Boards**: Create different boards for different projects
- **Custom Columns**: Add your own workflow stages

## 🚀 Usage Guide

### Accessing the Kanban View

1. Open the Task & Calendar modal
2. Click the **"Kanban"** tab in the header
3. Your default board will load automatically

### Creating Tasks on the Board

1. Click **"Add Task"** button in any column
2. Task will be created in that column
3. Drag tasks between columns to update status

### Drag and Drop

- **Click and hold** on a task card
- **Drag** to desired column
- **Drop** to move task
- Status updates automatically based on column settings

### Task Cards Display

Each task card shows:
- **Priority**: Color-coded left border
- **Cover Image**: If set
- **Title & Description**: Main content
- **Labels**: Colored tags
- **Progress Bar**: If progress is tracked
- **Metadata**: Due date, links count, attachments count
- **Star Status**: Starred tasks show ⭐

## 💾 Database Schema Details

### New Tables

#### `kanban_boards`
- Stores board configurations
- Links to task lists (optional)
- Contains view settings and preferences

#### `kanban_columns`
- Board columns/stages
- Maps to task statuses
- Contains color, limits, and auto-rules

#### `kanban_task_positions`
- Tracks task position within columns
- Enables drag-and-drop ordering
- Unique constraint: one task per board

### Enhanced Task Columns

```sql
-- Added to tasks table
links JSONB DEFAULT '[]'
color TEXT
cover_image TEXT
attachments JSONB DEFAULT '[]'
custom_fields JSONB DEFAULT '{}'
progress INTEGER DEFAULT 0
labels TEXT[] DEFAULT '{}'
```

## 📖 API Functions

### Kanban API (`lib/kanban.ts`)

```typescript
// Board Management
initializeDefaultBoard() // Creates default board with columns
getBoards() // Get all user boards
getBoard(boardId) // Get specific board with columns
createBoard(name, options) // Create new board
updateBoard(boardId, updates) // Update board
deleteBoard(boardId) // Delete board

// Column Management
getColumns(boardId) // Get board columns
createColumn(boardId, name, options) // Create column
updateColumn(columnId, updates) // Update column
deleteColumn(columnId) // Delete column
reorderColumns(boardId, columnIds) // Reorder columns

// Task Position Management
getTaskPositions(boardId) // Get all task positions
moveTask(taskId, boardId, columnId, position) // Move task
addTaskToBoard(taskId, boardId, columnId) // Add task to board
removeTaskFromBoard(taskId, boardId) // Remove task from board
```

### Task API Updates (`lib/tasks.ts`)

```typescript
// Enhanced createTask function now supports:
createTask(title, {
  // ... existing options
  links?: [{url, title, description}]
  color?: string
  coverImage?: string
  attachments?: [{name, url, size, type}]
  customFields?: Record<string, any>
  progress?: number
  labels?: string[]
})
```

## 🎯 Default Board Setup

When you first access the Kanban view, a default board is created with:

1. **To Do** column (gray) → Sets task status to 'todo'
2. **In Progress** column (blue) → Sets task status to 'in_progress'
3. **Review** column (orange) → Sets task status to 'waiting'
4. **Done** column (green) → Sets task status to 'completed'

## 🔧 Customization

### Creating Custom Boards

```typescript
import { createBoard, createColumn } from '@/lib/kanban'

// Create a custom board
const board = await createBoard('Sprint 1', {
  description: 'Development sprint board',
  color: '#8B5CF6',
  icon: '🚀'
})

// Add custom columns
await createColumn(board.id, 'Backlog', {
  color: '#94A3B8',
  sort_order: 0
})

await createColumn(board.id, 'Development', {
  color: '#3B82F6',
  auto_assign_status: 'in_progress',
  task_limit: 5, // WIP limit
  sort_order: 1
})
```

### Custom Column Features

- **Status Mapping**: Link columns to task statuses
- **Auto-Assign Status**: Auto-update task status on move
- **Task Limits**: Prevent overload with WIP limits
- **Custom Colors**: Visual differentiation
- **Sort Order**: Control column arrangement

## 🎨 Task Card Styling

Tasks are styled based on:

1. **Priority** (urgent/high/medium/low) - Border color
2. **Status** - Background color
3. **Custom Color** - Overrides border color if set
4. **Completion** - Strikethrough for completed tasks

## 📊 Board Features Roadmap

Future enhancements coming soon:
- [ ] Task detail panel for editing all fields
- [ ] Bulk task operations
- [ ] Board templates
- [ ] Swimming lanes
- [ ] Board analytics and insights
- [ ] Task dependencies visualization
- [ ] Automation rules

## 🐛 Troubleshooting

### Board Not Loading

1. Check console for errors
2. Verify database schema is applied
3. Ensure `handle_updated_at()` function exists
4. Check RLS policies are enabled

### Drag and Drop Not Working

1. Ensure `@dnd-kit` packages are installed
2. Check browser console for errors
3. Verify task positions table has data

### Tasks Not Appearing

1. Check task is added to board: `addTaskToBoard()`
2. Verify task has position in column
3. Check RLS policies allow access

## 📚 Component Structure

```
TaskCalendarModal.tsx
  ├── Header (with Kanban tab)
  ├── Stats Bar
  ├── Sidebar (Quick Actions & Filters)
  └── Main Content
      ├── Tasks View (List)
      ├── Kanban View (NEW) ← KanbanBoard component
      ├── Calendar View (Month grid)
      └── Timeline View (Chronological)

KanbanBoard.tsx
  ├── Board Header
  ├── Columns Container (DndContext)
  │   └── KanbanColumn (multiple)
  │       ├── Column Header
  │       ├── Tasks (Sortable)
  │       │   └── TaskCard (enhanced display)
  │       └── Add Task Button
  └── Drag Overlay
```

## 🎓 Best Practices

1. **Start with Default Board**: Understand the system before customizing
2. **Use Labels**: Tag tasks for quick filtering
3. **Set Progress**: Track task completion visually
4. **Add Links**: Keep all relevant resources in one place
5. **Use Cover Images**: Make boards visually appealing
6. **Set WIP Limits**: Prevent bottlenecks and overcommitment
7. **Map to Statuses**: Use auto-assign for workflow automation

## 🔗 Integration with Notes & Projects

Tasks can be linked to:
- **Notes** (`note_id`) - Associate with specific documents
- **Projects** (`project_id`) - Group by project
- **Task Lists** (`task_list_id`) - Organize by category

All these relationships work seamlessly with the Kanban board!

## 📝 Example Workflows

### Software Development

```
Backlog → To Do → In Development → Code Review → Testing → Done
```

### Content Creation

```
Ideas → Outline → Draft → Review → Edit → Published
```

### Customer Support

```
New → Assigned → In Progress → Waiting for Customer → Resolved
```

## 🎉 Enjoy Your Enhanced Task Management System!

You now have a professional-grade Kanban board integrated with your notes app. Create custom workflows, track progress visually, and manage tasks more effectively!

For questions or issues, check the database schema files and API documentation.
