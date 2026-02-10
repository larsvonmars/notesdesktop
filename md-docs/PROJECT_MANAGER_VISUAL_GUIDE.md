# Project Manager - Visual Overview

## UI Location

The Project Manager is accessible from the **bottom status bar** in the note editor:

```
┌──────────────────────────────────────────────────────────────┐
│                     Note Editor Area                          │
│                                                                │
│  [Rich text editing area or drawing canvas]                   │
│                                                                │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ ✓ Saved 2m ago │ 📁 Work/Docs │ TEXT │ 🎯 Projects │  Stats  │ <- Status Bar
└──────────────────────────────────────────────────────────────┘
                                           ^^^^^^^^^^
                                        NEW BUTTON HERE
```

## Button Design

The "Projects" button in the status bar:
- **Icon**: 🎯 Target icon (blue)
- **Label**: "Projects"
- **Style**: Clean, minimal, matches existing UI
- **Hover**: Changes to blue background
- **Location**: Left side of status bar, after note type indicator

## Project Manager Modal

When clicked, opens a large centered modal:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯 Project Manager                                          ✕   │
│    Organize your work into projects                              │
├─────────────────────────────────────────────────────────────────┤
│ [🔍 Search projects...]                    [+ New Project]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ▶ 🔵 Work Project                           📁 3  📄 12  ✏️ 🗑️  │
│     Backend development and APIs                                 │
│                                                                   │
│  ▼ 🟢 Personal Project                       📁 1  📄 5   ✏️ 🗑️  │
│     Personal notes and ideas                                     │
│     ┌───────────────────────────────────────────────────────┐   │
│     │ Folders                                                │   │
│     │  📁 Ideas                                             │   │
│     │                                                        │   │
│     │ Notes                                                  │   │
│     │  📄 Todo List                                         │   │
│     │  📄 Reading List                                      │   │
│     └───────────────────────────────────────────────────────┘   │
│                                                                   │
│  ▶ 🟠 Learning                               📁 2  📄 8   ✏️ 🗑️  │
│     Courses and tutorials                                        │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ 3 projects                                             [Close]   │
└─────────────────────────────────────────────────────────────────┘
```

### Modal Features:

1. **Header**
   - Target icon + title
   - Subtitle explaining purpose
   - Close button (X)

2. **Search & Create Bar**
   - Search input with icon
   - "New Project" button (blue, prominent)

3. **Project List**
   - Each project shows:
     - Expand/collapse arrow
     - Color dot indicator
     - Project name (bold)
     - Description (gray, smaller)
     - Statistics (folder count, note count)
     - Action buttons (edit, delete)
   
4. **Expanded Project View**
   - Shows nested content
   - Lists folders with folder icon
   - Lists notes with appropriate icon (text/drawing/mindmap)
   - Clickable items to navigate
   - Empty state message if no items

5. **Footer**
   - Project count
   - Close button

## Create/Edit Project Dialog

Clicking "New Project" or edit icon opens a nested modal:

```
┌─────────────────────────────────────────────────────┐
│ Create New Project                                   │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Project Name                                        │
│  [My Awesome Project_____________________]           │
│                                                       │
│  Description (optional)                              │
│  [What's this project about?______________]          │
│  [_______________________________________]           │
│  [_______________________________________]           │
│                                                       │
│  Color                                               │
│  🔵 🟢 🟠 🔴 🟣 🔴 🟦 🟪                             │
│                                                       │
│                             [Cancel]  [Create]       │
└─────────────────────────────────────────────────────┘
```

### Dialog Features:
- Text input for name (required)
- Textarea for description (optional)
- Color picker with 8 preset colors
- Visual indicator of selected color
- Cancel and Create/Save buttons

## Delete Confirmation Dialog

Clicking delete shows confirmation:

```
┌─────────────────────────────────────────────────────┐
│ 🗑️  Delete Project?                                 │
│                                                       │
│  Are you sure you want to delete "Work Project"?    │
│  Folders and notes will be moved to "No Project".   │
│  This action cannot be undone.                       │
│                                                       │
│                             [Cancel]  [Delete]       │
└─────────────────────────────────────────────────────┘
```

## Color Palette

The 8 available project colors:
1. **Blue** (#3B82F6) - Default, good for general projects
2. **Green** (#10B981) - Personal, health, nature themes
3. **Amber** (#F59E0B) - Important, priority items
4. **Red** (#EF4444) - Urgent, critical items
5. **Purple** (#8B5CF6) - Creative, artistic projects
6. **Pink** (#EC4899) - Personal, social themes
7. **Teal** (#14B8A6) - Learning, education
8. **Indigo** (#6366F1) - Technical, development

## Integration Points

### Status Bar Button
- **File**: `components/NoteEditor.tsx` (line ~1057)
- **Styled**: Matches existing status bar items
- **Position**: Left side, after note type indicator

### Modal Component
- **File**: `components/ProjectManager.tsx`
- **State**: Managed via `showProjectManager` in NoteEditor
- **Data**: Receives folders and notes as props

### Database
- **Schema**: `PROJECTS_SCHEMA.md`
- **API**: `lib/projects.ts`
- **Tables**: New `projects` table, updated `folders` and `notes` tables

## Responsive Design

The modal is responsive:
- **Desktop**: Large centered modal (max-width: 1024px)
- **Mobile**: Full-width with padding
- **Max height**: 80vh to prevent overflow
- **Scrollable**: Content area scrolls independently

## Accessibility

- Keyboard navigation supported
- Focus management for modals
- Escape key closes modals
- Enter key submits forms
- Screen reader friendly labels
- Color contrast meets WCAG standards

## Animation & Transitions

- Smooth fade-in for modals (backdrop)
- Expand/collapse animations for projects
- Hover states on all interactive elements
- Loading spinner during data fetch
- Transition colors: 150ms duration

## Empty States

1. **No Projects Yet**
   - Target icon (gray)
   - "No projects yet" message
   - "Create your first project" subtext
   - Prominent "Create Project" button

2. **No Search Results**
   - Search icon (gray)
   - "No projects found matching 'query'" message

3. **Empty Project**
   - "No items in this project yet" message
   - Shown in expanded project view

## Design System Consistency

All styling uses:
- **Tailwind CSS** utility classes
- **Color scheme**: Blue primary, Gray neutral
- **Border radius**: Rounded-lg (8px) for cards, Rounded-full for buttons/colors
- **Shadows**: Shadow-2xl for modals, Shadow-sm for cards
- **Typography**: System font stack, various weights
- **Spacing**: Consistent padding/margin scale

## Icon Usage

From `lucide-react` library:
- 🎯 **Target**: Projects button & header
- ➕ **Plus**: New project button
- ✏️ **Edit2**: Edit project
- 🗑️ **Trash2**: Delete project
- 🔍 **Search**: Search input
- ✕ **X**: Close buttons
- ▶️ **ChevronRight**: Collapsed project
- ▼ **ChevronDown**: Expanded project
- 📁 **Folder**: Folder count & items
- 📄 **FileText**: Note count & text notes
- 🎨 **PenTool**: Drawing notes
- 🧠 **Network**: Mindmap notes
- ⏳ **Loader2**: Loading state
