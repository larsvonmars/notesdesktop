# Complete Folder and Notes Management Features

This document describes all the folder and note management features available in Notes Desktop.

## Table of Contents

- [Overview](#overview)
- [Folder Management](#folder-management)
- [Note Management](#note-management)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Context Menus](#context-menus)
- [Sorting and Filtering](#sorting-and-filtering)

## Overview

The Unified Panel (accessed via the menu button in the top-left corner or `⌘\` / `Ctrl+\`) provides complete access to all folder and note management features. The panel includes two tabs:

- **Browse**: Navigate folders, create notes, and manage your content
- **Contents**: View table of contents for the current note (when available)

## Folder Management

### Creating Folders

**Methods:**
1. Click the "New Folder" button at the bottom of the folder list
2. Use keyboard shortcut `F` when the panel is open
3. Right-click on an existing folder and select "New Subfolder"
4. Click the context menu button (⋮) on a folder and select "New Subfolder"

**Features:**
- Create root-level folders
- Create nested subfolders (unlimited depth)
- Folders are automatically sorted by position

### Renaming Folders

**Methods:**
1. Right-click on a folder and select "Rename Folder"
2. Click the context menu button (⋮) on a folder and select "Rename Folder"

**Process:**
- Enter the new name in the prompt dialog
- The folder name is updated immediately

### Moving Folders

**Methods:**
1. Right-click on a folder and select "Move to" from the context menu
2. Choose the new parent folder from the list
3. Select "Root Level" to move to the top level

**Features:**
- Move folders between different parent folders
- Move subfolders to root level
- Visual hierarchy is maintained

### Deleting Folders

**Methods:**
1. Right-click on a folder and select "Delete Folder"
2. Click the context menu button (⋮) on a folder and select "Delete Folder"

**Safety Features:**
- Delete confirmation modal appears before deletion
- Notes inside the folder are automatically moved to the root level
- Cannot be undone warning is displayed

### Folder Navigation

**Features:**
- Expand/collapse folders by clicking the chevron icon
- Click on folder name to view its contents
- Visual indicator shows selected folder (blue highlight)
- Note count badge shows number of notes in each folder
- Nested folder structure with indentation

## Note Management

### Creating Notes

**Types of Notes:**
1. **Text Note** - Rich text editor with formatting
2. **Drawing** - Freehand drawing canvas
3. **Mindmap** - Visual mindmap editor

**Methods:**
1. Click the corresponding "New" button in the panel:
   - "Text Note" button (blue)
   - "Drawing" button (purple)
   - "Mindmap" button (green)
2. Use keyboard shortcuts when panel is open:
   - `N` - New text note
   - `D` - New drawing
   - `M` - New mindmap

**Features:**
- Notes are created in the currently selected folder
- New notes open immediately in the editor
- Auto-save functionality

### Viewing Notes

**Features:**
- Notes are listed under their parent folders
- Click any note to open it in the editor
- Visual indicators show:
  - Note type icon (📄 text, ✏️ drawing, 🕸️ mindmap)
  - Note title (or "Untitled" if no title)
  - Last updated date
- Currently selected note is highlighted in blue
- Hover to reveal context menu button

### Duplicating Notes

**Methods:**
1. Right-click on a note and select "Duplicate Note"
2. Click the context menu button (⋮) on a note and select "Duplicate Note"

**Features:**
- Creates an exact copy of the note
- Copy is titled "Original Title (Copy)"
- Copy is placed in the same folder
- Opens the duplicated note immediately

### Moving Notes

**Methods:**
1. Right-click on a note and select "Move to folder"
2. Choose the destination folder from the list
3. Select "All Notes (Root)" to move to root level

**Features:**
- Move notes between folders
- Move notes from folders to root level
- Note's content and metadata are preserved

### Deleting Notes

**Methods:**
1. Right-click on a note and select "Delete Note"
2. Use the delete button in the note editor toolbar
3. Click the trash icon in the unified panel

**Safety Features:**
- Delete confirmation modal appears before deletion
- Shows note name in the confirmation
- Cannot be undone warning is displayed

### Searching Notes

**Features:**
- Search box at the top of the Browse tab
- Real-time search as you type (300ms debounce)
- Searches both note titles and content
- Separate results sections for notes and folders
- Search results show:
  - Note type icon
  - Note title
  - Folder path (breadcrumb)
  - Last updated date
- Click any result to open the note
- Folders matching search are also displayed

## Keyboard Shortcuts

### Panel Control
- `⌘\` / `Ctrl+\` - Toggle unified panel open/close

### Creating Content (when panel is open)
- `N` - Create new text note
- `D` - Create new drawing
- `M` - Create new mindmap
- `F` - Create new folder

### Notes
- All shortcuts work when the panel is open
- Shortcuts are disabled when typing in input fields
- Visual keyboard hints shown on buttons

## Context Menus

### Folder Context Menu

**Access:**
- Right-click on any folder
- Click the ⋮ (more) button on folder hover

**Options:**
- Rename Folder
- New Subfolder
- Move to (with list of available parent folders)
- Delete Folder

### Note Context Menu

**Access:**
- Right-click on any note
- Click the ⋮ (more) button on note hover

**Options:**
- Duplicate Note
- Move to folder (with list of available folders)
- Delete Note

## Sorting and Filtering

### Note Sorting

**Location:** Dropdown in "Your Notes" section header

**Options:**
1. **Last Updated** (default) - Most recently modified notes first
2. **Date Created** - Newest notes first
3. **Title (A-Z)** - Alphabetical by title

**Features:**
- Sorting applies to all note lists (folders and root)
- Sorting preference is maintained during the session
- Works in combination with search filtering

### Search Filtering

**Features:**
- Filter notes by title or content
- Filter folders by name
- Real-time results with loading indicator
- Separate sections for notes and folders
- Shows folder hierarchy for context
- Automatic folder expansion when selecting search results

## Visual Indicators

### Note Type Icons
- 📄 (FileText icon) - Text notes (blue)
- ✏️ (PenTool icon) - Drawing notes (purple)
- 🕸️ (Network icon) - Mindmap notes (green)

### Folder States
- 📁 (Folder icon) - Collapsed folder
- 📂 (FolderOpen icon) - Expanded folder
- ▶️ (ChevronRight) - Collapsed state indicator
- ▼ (ChevronDown) - Expanded state indicator

### Visual Feedback
- Blue highlight for selected items
- Gray hover state for interactive items
- Note count badges on folders
- Loading spinners during async operations
- Unsaved changes indicator (yellow dot)

## Best Practices

### Organization
1. Use folders to organize notes by project, topic, or category
2. Create subfolders for more granular organization
3. Use descriptive folder and note names
4. Leverage search for quick access across all notes

### Workflow
1. Press `⌘\` to quickly open the panel
2. Use keyboard shortcuts for faster note creation
3. Use context menus for quick actions
4. Sort notes by relevance (updated, created, or title)
5. Use search when you have many notes

### Safety
1. Review the confirmation modal before deleting
2. Use duplicate before making major changes to a note
3. Organize notes into folders before deletion to avoid losing track
4. Remember that folder deletion moves notes to root (not deleted)

## Troubleshooting

### Notes not appearing
- Check if you're in the correct folder
- Clear search filter if active
- Refresh by toggling folder expand/collapse

### Search not working
- Ensure you're typing in the search box
- Wait for debounce (300ms)
- Check for spelling errors
- Note content may not be indexed for drawing/mindmap types

### Context menu not showing
- Try right-clicking again
- Check if you're clicking on the note/folder element
- Use the ⋮ button as alternative

### Keyboard shortcuts not working
- Ensure panel is open
- Check you're not in an input field
- Verify correct key combination

## Technical Details

### Data Storage
- All data stored in Supabase PostgreSQL
- Real-time synchronization via Supabase subscriptions
- Automatic conflict resolution

### Performance
- Lazy loading of folder contents
- Search debouncing (300ms)
- Optimistic UI updates
- Efficient re-rendering with React hooks

### Accessibility
- Keyboard navigation support
- Focus management
- ARIA labels for screen readers
- Visual feedback for all interactions
