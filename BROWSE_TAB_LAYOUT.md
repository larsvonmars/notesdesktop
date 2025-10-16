# Browse Tab Layout

## Visual Structure

```
┌─────────────────────────────────────────┐
│  UNIFIED PANEL - Browse Tab             │
├─────────────────────────────────────────┤
│                                         │
│  [+ New Note]  ← Always at top         │
│                                         │
│  📦 All Notes                      (25) │
│     ├─ 📄 Meeting Notes               │
│     ├─ 📄 Project Ideas               │
│     ├─ 📄 Weekly Review               │
│     └─ 📄 ...                         │
│                                         │
│  ───────────── FOLDERS ─────────────   │
│                                         │
│  ▼ 📁 Work                         (8) │
│     ├─ 📄 Sprint Planning            │
│     ├─ 📄 Team Meeting               │
│     └─ 📄 Code Review                │
│                                         │
│  ▶ 📁 Personal                     (12)│
│                                         │
│  ▼ 📁 Projects                     (5) │
│     ▶ 📁 App Development           (3)│
│     ▼ 📁 Website Redesign          (2)│
│        ├─ 📄 Design Mockups          │
│        └─ 📄 Color Schemes           │
│                                         │
│  [+ New Folder] ← Always at bottom     │
│                                         │
└─────────────────────────────────────────┘
```

## Interaction Flow

### 1. **Viewing All Notes**
```
Click "All Notes" (📦)
    ↓
Notes expand below it
    ↓
Shows all notes across all folders
```

### 2. **Browsing by Folder**
```
Click a folder (📁)
    ↓
Notes in that folder appear nested below
    ↓
Click a note to open it
```

### 3. **Expanding Folders**
```
Click the arrow (▶/▼)
    ↓
Subfolder tree expands/collapses
    ↓
Navigate deeper hierarchy
```

### 4. **Note Selection**
```
Click any note (📄)
    ↓
Note opens in full-screen editor
    ↓
Menu remains accessible via button
```

## Key Features

### Visual Indicators
- **▶ Collapsed folder** - Click to expand
- **▼ Expanded folder** - Click to collapse
- **📦 All Notes** - Special "view all" option
- **📁 Folder icon** - Regular folder
- **📄 Note icon** - Individual note
- **(#)** - Count badge showing number of notes

### Color Coding
- **Blue background** - Currently selected folder/note
- **Blue border** - Notes list for selected folder
- **Gray hover** - Hoverable items
- **White background** - Default state

### Nesting Levels
```
Level 0: All Notes, Root Folders
Level 1: ├─ Notes in folders, Subfolders
Level 2:    ├─ Notes in subfolders
Level 3:       ├─ Deeper nesting...
```

## Examples

### Example 1: Finding a Work Note
1. Open panel (click menu button)
2. Click "Work" folder
3. See work notes appear below
4. Click the note you want
5. Start editing!

### Example 2: Creating a Note in a Folder
1. Open panel
2. Click the folder where you want the note
3. Click "+ New Note" at top
4. Note is created in that folder
5. Start writing!

### Example 3: Organizing with Subfolders
1. Open panel
2. Click arrow next to "Projects"
3. See subfolders expand
4. Click "App Development"
5. See notes in that subfolder
6. Navigate freely!

## Advantages

✅ **Single View**: Both folders and notes visible together  
✅ **Context**: Always see where your notes are located  
✅ **Quick Navigation**: Jump between folders and notes instantly  
✅ **Visual Hierarchy**: Clear parent-child relationships  
✅ **Efficient**: No tab-switching needed  
✅ **Familiar**: Works like a file browser  
