# Unified Panel Guide

## Overview

The Notes Desktop app now features a **unified floating control panel** that combines all navigation and editing controls into a single, elegant interface. This eliminates clutter and provides a distraction-free writing experience.

## Features

### 🎯 Single Floating Menu Button
- **Location**: Top-left corner of the screen
- **Toggle**: Click to open/close the panel
- **Always Accessible**: Stays visible while editing

### 📋 Unified Control Panel

The panel combines the following into one interface:

#### 1. **Note Controls** (Top Section)
- **Title Input**: Edit your note title directly
- **Save Button**: Save changes (disabled when no changes)
- **Delete Button**: Remove the current note (visible only for existing notes)
- **Cancel Button**: Close the editor
- **Status Indicator**: Shows "Unsaved changes" when modifications are pending

#### 2. **Tabbed Navigation**
Two streamlined tabs organize your workflow:

##### **Browse Tab** 🗂️📝
This unified tab combines folders and notes into a single browseable hierarchy:

- **New Note Button**: Create a new note at the top
- **All Notes**: Click to see all notes across all folders
  - Notes are displayed in a nested list below when selected
  - Shows count of total notes
- **Folders Section**: Hierarchical folder structure
  - Click folder name to view notes in that folder
  - Click arrow/chevron to expand/collapse subfolders
  - Notes appear nested under their folder when selected
  - Folder badge shows note count
  - Expandable tree structure for organization
- **New Folder Button**: Create a new folder at the bottom

**Navigation Pattern:**
1. Click a folder → Notes in that folder appear nested below
2. Click a note → Opens in the editor
3. Expand folders with the arrow to see subfolders
4. "All Notes" shows everything in one view

##### **TOC Tab** 📑
- Table of Contents for the current note
- Auto-generated from headings (H1, H2, H3)
- Click any heading to jump to that section
- Indented based on heading level
- Shows "No headings" when the note has no headings

#### 3. **Footer Controls**
- **Find & Replace Button**: Opens search dialog
- **Statistics**: Character count, word count, last update date

## User Experience

### Opening a Note
1. Click the menu button (top-left)
2. In the "Browse" tab, you'll see:
   - "All Notes" option at the top
   - Your folder hierarchy below
3. Click on a folder to see its notes appear nested below
4. Click on any note to open it
5. The editor fills the entire screen
6. Menu button remains accessible for navigation

### Editing Flow
1. Open menu → Browse tab
2. Select a folder or "All Notes"
3. Click a note to open it
4. Edit title in the panel, content in the main area
5. Save button activates when changes are made

### Navigation
- **Browse Tab**: Unified folders + notes view
  - Click folders to see their notes
  - Expand/collapse with arrows
  - Click notes to open them
- **TOC Tab**: Navigate within the current note
- Everything accessible from one interface!

### Clean Editor View
- Full-screen, distraction-free editor
- No toolbars or sidebars cluttering the view
- Floating formatting toolbar appears only when text is selected
- Slash commands (`/`) for quick formatting

## Keyboard Shortcuts

All existing shortcuts still work:

- **⌘/Ctrl + S**: Save note
- **⌘/Ctrl + Enter**: Quick save
- **⌘/Ctrl + F**: Find & Replace
- **⌘/Ctrl + B**: Bold
- **⌘/Ctrl + I**: Italic
- **⌘/Ctrl + Shift + C**: Checklist
- And all other formatting shortcuts

## Benefits

✅ **Unified Browse Experience**: Folders and notes in one cohesive view  
✅ **Hierarchical Navigation**: See notes nested under their folders  
✅ **Less Clutter**: Streamlined 2-tab interface (Browse + TOC)  
✅ **Better Focus**: Full-screen editing experience  
✅ **Quick Access**: All controls just one click away  
✅ **Intuitive**: File-browser-like navigation pattern  
✅ **Responsive**: Works great on all screen sizes  
✅ **Smart**: Panel closes when clicking outside  
✅ **Visual Feedback**: Note counts, selected states, nesting indicators  

## Technical Details

### Components
- **UnifiedPanel.tsx**: The main floating panel component (optimized for WebView and Tauri)
- **NoteEditor.tsx**: Updated to work with the unified panel
- **RichTextEditor.tsx**: The core content editing component

### WebView and Tauri Optimization
The UnifiedPanel is fully optimized for WebView and Tauri environments:
- Uses only standard browser APIs that work across all WebView implementations
- No deprecated or problematic APIs (no CSS.escape, queryCommandState, etc.)
- Touch and pointer events properly handled
- Works seamlessly on Windows (WebView2), macOS (WKWebView), and Linux (WebKitGTK)

### State Management
The panel handles:
- Note title and content state
- Folder navigation
- Notes list
- Table of contents
- Search functionality
- Save/delete operations

### Responsive Design
- Mobile-friendly tabs
- Touch-optimized buttons
- Adapts to screen size
- Scrollable content areas
- Maximum height constraints

## Future Enhancements

Potential improvements:
- Keyboard shortcut to toggle panel (e.g., ⌘/Ctrl + \\)
- Recent notes quick access
- Pinned notes/folders
- Search across all notes
- Tags and categories
- Export options
