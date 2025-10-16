# Multi-Page Drawing Feature 📄

## Overview

Drawing notes now support multiple pages! This makes the drawing editor perfect for:
- ✏️ **Multi-page documents** - Long notes, reports, or study guides
- 📖 **Presentations** - Slide-by-slide drawings or diagrams
- 📓 **Notebooks** - Organize thoughts across multiple pages
- 🗂️ **Chapters** - Break complex topics into separate pages

---

## ✨ What's New

### Multiple Pages per Drawing Note
- Each drawing note can have unlimited pages
- Each page has its own:
  - Drawing strokes
  - Background pattern (grid/lines/dots/none)
  - Independent canvas

### Page Navigation
- **Previous/Next buttons** - Navigate through pages
- **Page counter** - Shows current page and total pages (e.g., "3 / 5")
- **Add page button** - Create new blank pages instantly
- **Delete page button** - Remove unwanted pages

### Per-Page Controls
- Each page can have a different background pattern
- Clear button clears only the current page
- Export exports only the current page
- Undo/Redo works across all pages

---

## 🎨 Using the Multi-Page Feature

### Page Navigation Bar

Located in the toolbar between "Clear" and "Export" buttons:

```
[<] [3 / 5] [>] [+] [🗑️]
 ↑    ↑     ↑   ↑    ↑
 |    |     |   |    Delete current page
 |    |     |   Add new page
 |    |     Next page
 |    Page counter (current / total)
 Previous page
```

### Creating Pages

1. **First Page**: Automatically created with new drawing
2. **Add More**: Click the **[+]** button to add a new page
3. **Navigate**: Use **[<]** and **[>]** to move between pages

### Organizing Content

**Page 1: Title/Cover**
- Use "Lines" background
- Write title and overview

**Page 2: Diagrams**
- Switch to "Grid" background
- Draw technical diagrams

**Page 3: Notes**
- Use "Lines" background
- Add detailed notes

**Page 4: Sketches**
- Use "None" background
- Free-form sketching

### Page Management

#### Adding Pages
- Click **[+]** button
- New page is added at the end
- Automatically navigates to new page
- New page starts with "None" background

#### Deleting Pages
- Navigate to page you want to delete
- Click **[🗑️]** button (trash icon)
- Page is removed immediately
- Cannot delete the last remaining page
- Automatically shows previous page after deletion

#### Navigation
- **[<] Previous**: Goes to previous page (disabled on page 1)
- **[>] Next**: Goes to next page (disabled on last page)
- **Counter**: Shows "Current / Total" (e.g., "2 / 4")

---

## 🔧 Technical Details

### Data Structure

**New Format:**
```typescript
{
  pages: [
    {
      strokes: [...],
      background: 'grid'
    },
    {
      strokes: [...],
      background: 'lines'
    }
  ],
  width: 800,
  height: 600,
  currentPage: 0
}
```

**Old Format (Migrated Automatically):**
```typescript
{
  strokes: [...],
  width: 800,
  height: 600,
  background: 'none'
}
```

### Automatic Migration

Existing single-page drawings are automatically migrated to the new format when loaded:
- Old `strokes` array becomes Page 1
- Old `background` becomes Page 1 background
- `currentPage` set to 0

### Storage

- All pages stored in single note's `content` field as JSON
- Current page index saved for resuming where you left off
- Each page fully independent

---

## 📊 Use Cases

### 1. **Meeting Notes**
- **Page 1**: Meeting agenda
- **Page 2**: Whiteboard diagrams
- **Page 3**: Action items

### 2. **Study Guides**
- **Page 1**: Chapter overview
- **Page 2-5**: Detailed notes per topic
- **Page 6**: Summary/review

### 3. **Presentations**
- **Page 1**: Title slide
- **Page 2-10**: Content slides
- **Page 11**: Conclusion

### 4. **Project Planning**
- **Page 1**: Project overview
- **Page 2**: Timeline/Gantt chart
- **Page 3**: Resource allocation
- **Page 4**: Risk assessment

### 5. **Design Mockups**
- **Page 1**: Desktop layout
- **Page 2**: Mobile layout
- **Page 3**: Tablet layout
- **Page 4**: Component details

---

## 💡 Tips & Tricks

### Organizing Multi-Page Documents

1. **Use Consistent Backgrounds**
   - Same background for similar page types
   - Grid for diagrams, Lines for notes

2. **Plan Page Count**
   - Add all pages upfront
   - Easier to navigate later

3. **Navigation Shortcuts**
   - **Next**: Complete current page, click [>]
   - **Previous**: Review, click [<]
   - **Add**: Need more space, click [+]

### Working Efficiently

1. **Rough Draft First**
   - Add multiple pages
   - Sketch quickly on each
   - Refine later by navigating back

2. **Page-Specific Backgrounds**
   - Grid for structured content
   - Lines for handwriting
   - None for free-form

3. **Export Strategy**
   - Export important pages individually
   - Each export labeled with page number
   - Keep exports organized

### Best Practices

✅ **Do:**
- Add pages as needed (no limit!)
- Use different backgrounds per page
- Navigate freely while drawing
- Export individual pages for sharing

❌ **Don't:**
- Delete pages accidentally (no undo for deletion)
- Create too many empty pages
- Forget which page you're on (check counter)

---

## 🎯 Keyboard Shortcuts (Future)

Planned shortcuts for faster navigation:

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + →` | Next page |
| `Ctrl/Cmd + ←` | Previous page |
| `Ctrl/Cmd + N` | New page |
| `Ctrl/Cmd + Delete` | Delete current page |
| `Ctrl/Cmd + 1-9` | Jump to page 1-9 |

---

## 🔄 Migration from Single-Page

### Automatic Process
1. Load old drawing note
2. System detects old format
3. Converts to multi-page format
4. Shows migration in console (dev mode)
5. Works seamlessly - no data loss

### What Happens
- Old drawing becomes "Page 1"
- All settings preserved
- Can immediately add more pages
- Original file updated on next save

### Verification
```typescript
// Old format detected if:
data.strokes && !data.pages

// Migrated to:
{
  pages: [{ strokes: data.strokes, background: data.background }],
  width: data.width,
  height: data.height,
  currentPage: 0
}
```

---

## 🚀 Examples

### Example 1: 3-Page Meeting Notes

**Setup:**
1. Create new drawing note
2. Title: "Team Meeting - 2025-10-15"
3. Add 2 more pages (total: 3)

**Page 1 - Agenda:**
- Background: Lines
- Handwrite meeting agenda
- List attendees

**Page 2 - Whiteboard:**
- Background: Grid
- Draw architecture diagram
- Add flowchart

**Page 3 - Action Items:**
- Background: Lines
- List action items
- Assign owners

### Example 2: 5-Page Study Guide

**Page 1 - Overview:**
- Background: None
- Mind map of chapter topics

**Pages 2-4 - Details:**
- Background: Lines
- Detailed notes per topic
- Formulas and examples

**Page 5 - Practice:**
- Background: Grid
- Practice problems
- Solutions

---

## 📈 Performance

- ✅ **Fast navigation** - Instant page switching
- ✅ **Efficient storage** - Only active page rendered
- ✅ **Smooth drawing** - No lag with many pages
- ✅ **Quick exports** - Export per page

**Tested with:**
- 20+ pages per note
- 100+ strokes per page
- Different backgrounds per page
- No performance issues

---

## 🎓 Advanced Features

### Page-Specific Settings
Each page independently stores:
- Stroke data
- Background type
- Rendering state

### History Management
- Undo/Redo works across pages
- Navigate between pages without losing history
- Full history preserved per session

### Export Workflow
```
1. Navigate to page to export
2. Click Export button
3. Choose PNG or SVG
4. File named: drawing-page-[N]-[timestamp].png
5. Repeat for other pages
```

---

## 🐛 Troubleshooting

### Issue: Can't delete page
**Solution**: Must have at least 1 page. Last page cannot be deleted.

### Issue: Lost track of current page
**Solution**: Check page counter in toolbar (shows "X / Y").

### Issue: Page navigation disabled
**Solution**: 
- [<] disabled on page 1
- [>] disabled on last page
- This is normal behavior

### Issue: Old drawing looks different
**Solution**: Automatic migration successful. Drawing is now page 1 of multi-page note.

---

## 📋 Feature Summary

| Feature | Description | Status |
|---------|-------------|--------|
| Multiple Pages | Unlimited pages per note | ✅ Live |
| Page Navigation | Previous/Next buttons | ✅ Live |
| Add Pages | Create new blank pages | ✅ Live |
| Delete Pages | Remove unwanted pages | ✅ Live |
| Page Counter | Shows current/total | ✅ Live |
| Per-Page Backgrounds | Different per page | ✅ Live |
| Auto Migration | Old format → New | ✅ Live |
| Page-Specific Export | Export individual pages | ✅ Live |
| Keyboard Shortcuts | Quick navigation | 🔄 Planned |
| Page Thumbnails | Visual page selector | 🔄 Planned |
| Page Reordering | Drag-and-drop pages | 🔄 Planned |
| Duplicate Page | Copy page content | 🔄 Planned |

---

Enjoy your new multi-page drawing editor! 📚✨
