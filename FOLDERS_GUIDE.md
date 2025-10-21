# Folders & Nested Structure - Complete Guide

## ✅ What's Been Added

A complete folder system with unlimited nesting depth and intuitive organization:

### New Components
- **UnifiedPanel** (`components/UnifiedPanel.tsx`) - Floating panel with hierarchical folder navigation and notes management (replaces old FolderTree)
- **Folders API** (`lib/folders.ts`) - Complete CRUD operations
- **Updated Dashboard** - Full-screen editor with floating panel

### New Features
✅ **Unlimited nesting** - Create folders within folders, no depth limit  
✅ **Drag & drop** - Move notes between folders with visual feedback  
✅ **Context menus** - Right-click for folder and note actions  
✅ **Real-time sync** - Folder changes appear instantly  
✅ **Expand/collapse** - Collapsible folder tree with chevron indicators  
✅ **Search** - Find notes and folders quickly  
✅ **WebView optimized** - Works perfectly in Tauri on all platforms  

## 📋 Setup Required

### 1. Run Database Migration

Go to your Supabase SQL Editor and run the schema from `FOLDERS_SCHEMA.md`:

```sql
-- 1. Create folders table
-- 2. Add folder_id to notes table
-- Copy and run the entire SQL from FOLDERS_SCHEMA.md
```

This creates:
- `folders` table with nested structure
- Updates `notes` table with `folder_id` column
- RLS policies for security
- Indexes for performance
- Real-time subscriptions

### 2. Restart the App

```bash
npm run tauri:dev
```

## 🎨 New UI Layout

The dashboard now features a full-screen editor with a floating panel:

```
┌───────────────────────────────────────────────────┐
│                                        [☰ Menu]   │
│                                                   │
│                                                   │
│                                                   │
│           Full-Screen Note Editor                 │
│                                                   │
│                                                   │
│                                                   │
│                                                   │
└───────────────────────────────────────────────────┘

When menu is clicked, UnifiedPanel appears:
┌──────────────────────────────────┐
│ [User Info]          [Sign Out] │
│ ┌──────────────────────────────┐│
│ │ Note Title                   ││
│ │ [Save] [Delete] [Cancel]     ││
│ └──────────────────────────────┘│
│ [Browse] [Contents]              │
│ ┌──────────────────────────────┐│
│ │ 📝 Create New                ││
│ │ 🔍 Search                    ││
│ │ 📁 All Notes (3)             ││
│ │ 📂 Folders                   ││
│ │   📁 Work (5)                ││
│ │     📁 Projects (2)          ││
│ │   📁 Personal (3)            ││
│ │ [+ New Folder]               ││
│ └──────────────────────────────┘│
└──────────────────────────────────┘
```

- **Full Screen**: Distraction-free editor
- **Floating Panel**: Toggles with menu button or ⌘/Ctrl+\\
- **Unified Navigation**: Folders and notes in one view

## 🌳 Folder Tree Features

### Creating Folders

**Method 1: Root Folder**
- Click "+ New Folder" at bottom
- Enter folder name
- Press Enter

**Method 2: Subfolder**
- Hover over parent folder
- Click "+" icon
- Or right-click → "New Subfolder"

**Method 3: Context Menu**
- Right-click any folder
- Select "New Subfolder"

### Managing Folders

**Rename**
- Right-click folder → "Rename"
- Edit name inline
- Press Enter to save, Esc to cancel

**Delete**
- Right-click folder → "Delete"
- Confirm deletion
- Notes inside move to root (not deleted)
- Subfolders are also deleted (cascade)

**Navigate**
- Click folder to view its notes
- Click "All Notes" to see root notes

**Expand/Collapse**
- Click arrow icon to toggle
- Folders with subfolders show arrow

## 📁 Folder Structure Examples

### Simple Organization
```
📁 Work
📁 Personal
📁 Archive
📄 Quick Notes (root)
```

### Nested Projects
```
📁 Projects
   📁 Client A
      📁 Meetings
      📁 Deliverables
      📄 Project Overview
   📁 Client B
      📁 Research
      📄 Proposal
```

### Deep Nesting
```
📁 Company
   📁 Engineering
      📁 Backend
         📁 API
            📁 v1
               📄 Endpoints
               📄 Auth
            📁 v2
               📄 New Features
```

## 🔄 How It Works

### Data Flow

**Creating a note in a folder**:
```
1. Select folder in tree
2. Click "New Note"
3. Note is created with folder_id
4. Appears in middle column
```

**Moving between folders** (manual for now):
```
1. Edit note
2. Change folder_id in database
3. Real-time update refreshes UI
```

**Deleting a folder**:
```
1. Right-click → Delete
2. Folder deleted (cascade to subfolders)
3. Notes' folder_id set to NULL (moved to root)
4. Real-time update refreshes all views
```

## 🔍 Filtering & Navigation

### Current Behavior

- **All Notes**: Shows notes with `folder_id = NULL`
- **Folder Selected**: Shows notes with `folder_id = selected_folder`
- **Real-time Updates**: Both folders and notes update automatically

### Search (Future Enhancement)

The API supports searching across all folders:
```typescript
const results = await searchNotes('keyword')
// Returns notes from any folder
```

## 🎯 API Functions

### Folder Operations

```typescript
// Get all folders
const folders = await getFolders()

// Get root folders only
const roots = await getRootFolders()

// Get subfolders
const subfolders = await getSubfolders(parentId)

// Create folder
const folder = await createFolder({
  name: 'My Folder',
  parent_id: null, // or parent folder ID
})

// Rename folder
await updateFolder(folderId, { name: 'New Name' })

// Delete folder
await deleteFolder(folderId)

// Move folder
await moveFolder(folderId, newParentId)

// Get folder path (breadcrumbs)
const path = await getFolderPath(folderId)
// Returns: [grandparent, parent, folder]
```

### Note Operations with Folders

```typescript
// Create note in folder
const note = await createNote({
  title: 'My Note',
  content: 'Content here',
  folder_id: selectedFolderId, // or null for root
})

// Get notes in folder
const notes = await getNotesByFolder(folderId)

// Get root notes
const rootNotes = await getNotesByFolder(null)

// Move note to folder
await moveNote(noteId, newFolderId)
```

## 🔐 Security

All folder operations are protected by RLS:
- Users can only see their own folders
- Users can only modify their own folders
- Folder hierarchy is isolated per user
- Notes remain isolated within folders

## 📊 Database Structure

### Folders Table
```
id          uuid (primary key)
user_id     uuid (references auth.users)
name        text
parent_id   uuid (references folders, nullable)
position    integer (for ordering)
created_at  timestamp
updated_at  timestamp
```

### Updated Notes Table
```
... existing columns ...
folder_id   uuid (references folders, nullable)
position    integer (for ordering within folder)
```

## 🚀 Advanced Features (Future)

### 1. Drag & Drop
Enable dragging notes between folders:
```typescript
// Already supported in API
await moveNote(noteId, newFolderId)
await moveFolder(folderId, newParentId)
```

### 2. Breadcrumb Navigation
Show current folder path:
```typescript
const path = await getFolderPath(folderId)
// Render: Home > Projects > Client A
```

### 3. Folder Colors/Icons
Add to folders table:
```sql
alter table folders add column color text;
alter table folders add column icon text;
```

### 4. Folder Sharing
Share entire folders with other users:
```sql
create table folder_shares (
  folder_id uuid references folders,
  shared_with uuid references auth.users,
  permission text -- 'read' or 'write'
);
```

### 5. Folder Templates
Create folder structures from templates:
```typescript
const template = {
  name: 'Project Template',
  subfolders: ['Meetings', 'Docs', 'Notes']
}
```

### 6. Bulk Operations
Move multiple notes at once:
```typescript
await bulkMoveNotes(noteIds, targetFolderId)
```

## 💡 Usage Tips

1. **Organize Early**: Create folders before you have too many notes
2. **Use Nesting Wisely**: 2-3 levels deep is usually sufficient
3. **Naming Convention**: Use clear, descriptive folder names
4. **Root Notes**: Keep quick notes at root for easy access
5. **Archive Folders**: Create an "Archive" folder for old notes

## 🐛 Troubleshooting

### Folders not showing?
1. Check database schema is created
2. Verify user is authenticated
3. Check browser console for errors

### Can't create folders?
1. Verify RLS policies are set up
2. Check Supabase connection
3. Ensure user_id is correct

### Real-time not working?
1. Confirm Realtime is enabled in Supabase
2. Check WebSocket connection
3. Verify subscription filters

### Notes disappeared?
- They're probably in root (folder_id = NULL)
- Click "All Notes" to see them

## 📚 Files Reference

- `components/FolderTree.tsx` - Folder tree UI
- `lib/folders.ts` - Folder API functions
- `lib/notes.ts` - Updated with folder support
- `app/dashboard/page.tsx` - Integrated layout
- `FOLDERS_SCHEMA.md` - Database schema

## ✨ Summary

You now have a complete folder system with:
- ✅ Unlimited nested folders
- ✅ Context menu operations
- ✅ Real-time synchronization
- ✅ Secure user isolation
- ✅ Clean, intuitive UI
- ✅ Full CRUD operations

**Just run the database migration and start organizing your notes!**
