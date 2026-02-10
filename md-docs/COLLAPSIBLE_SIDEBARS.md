# Collapsible Sidebar Navigation

## Overview
The dashboard now features retractable sidebars for folders and notes, allowing users to maximize the editing area for distraction-free writing.

## Features

### 1. Collapsible Folder Sidebar (Left)
- **Width**: 256px (16rem) when expanded
- **Toggle Button**: PanelLeftClose icon to collapse
- **Show Button**: PanelLeftOpen icon when collapsed (appears on left edge)
- **Smooth Animation**: 300ms transition

### 2. Collapsible Notes List (Middle)
- **Width**: 320px (20rem) when expanded  
- **Toggle Button**: PanelRightClose icon (positioned at -right-3 for easy access)
- **Show Button**: PanelRightOpen icon when collapsed
- **Smart Positioning**: Show button adjusts based on folder sidebar state

### 3. Flexible Editor Area
- **Layout**: Uses flexbox for responsive width adjustment
- **Min Width**: `min-w-0` prevents overflow issues
- **Flex Grow**: Automatically expands to fill available space
- **Maximum Space**: Can use full width when both sidebars collapsed

## Layout Modes

### 1. Full View (Default)
```
[Folders (256px)] [Notes (320px)] [Editor (flexible)]
```

### 2. Editor + Notes
```
[Show Folders btn] [Notes (320px)] [Editor (flexible)]
```

### 3. Editor + Folders
```
[Folders (256px)] [Show Notes btn] [Editor (flexible)]
```

### 4. Full-Width Editor
```
[Show Folders btn] [Show Notes btn] [Editor (100%)]
```

## Technical Implementation

### State Management
```typescript
const [showFolders, setShowFolders] = useState(true)
const [showNotes, setShowNotes] = useState(true)
```

### Toggle Buttons
**Inside Sidebar (Collapse):**
- Positioned in header area
- Rounded button with hover state
- Icon indicates collapse direction

**Outside Sidebar (Expand):**
- Absolutely positioned on edge
- White background with shadow
- Dynamic positioning based on other sidebar state

### Styling Classes

**Folder Sidebar:**
```css
/* When visible */
w-64 flex-shrink-0 transition-all duration-300

/* Header button */
p-1.5 rounded-lg text-gray-500 hover:bg-gray-100
```

**Notes Sidebar:**
```css
/* When visible */
w-80 flex-shrink-0 transition-all duration-300

/* Floating close button */
absolute -right-3 top-4 z-10 bg-white rounded-lg border shadow-sm
```

**Show Buttons:**
```css
absolute left-0 top-0 z-10 p-2 bg-white rounded-r-lg border border-l-0 shadow-sm
```

**Editor Area:**
```css
flex-1 min-w-0 /* Flexible width, prevents overflow */
```

### Icons Used
- **PanelLeftClose**: Hide left sidebar (folders)
- **PanelLeftOpen**: Show left sidebar
- **PanelRightClose**: Hide right sidebar (notes)
- **PanelRightOpen**: Show right sidebar

## User Experience

### Benefits
1. **Distraction-Free Writing**: Hide sidebars for focus mode
2. **Quick Access**: Toggle buttons always visible when collapsed
3. **Flexible Workflow**: Choose layout based on task
4. **More Screen Space**: Editor can use up to 100% width
5. **Smooth Transitions**: Animations prevent jarring layout shifts

### Interaction Flow
1. **Initial Load**: Both sidebars visible (default)
2. **Click PanelLeftClose**: Folder sidebar slides away, show button appears
3. **Click PanelRightClose**: Notes sidebar slides away, show button appears
4. **Editor Expands**: Automatically grows to fill available space
5. **Click Show Buttons**: Sidebars slide back in with smooth animation

### Accessibility
- Clear icon indicators (open/close panels)
- Hover states for all toggle buttons
- Tooltips explain button function
- Keyboard navigable (tab focus order)
- Screen reader friendly labels

## Responsive Behavior

### Desktop (≥1024px)
- Full sidebar controls available
- Smooth transitions between states
- Optimal editing experience

### Tablet (768px - 1024px)
- Sidebars may overlap on smaller screens
- Toggle functionality crucial for usability
- Editor maintains flexibility

### Mobile (<768px)
- Sidebars stack vertically (existing mobile layout)
- Toggle buttons less critical
- Responsive grid handles layout

## Layout Calculations

### Width Distribution
**All Visible:**
- Folders: 256px
- Notes: 320px
- Gap: 48px (6 × 8px)
- Editor: calc(100% - 624px)

**Only Notes:**
- Notes: 320px
- Gap: 24px
- Editor: calc(100% - 344px)

**Only Folders:**
- Folders: 256px
- Gap: 24px
- Editor: calc(100% - 280px)

**Editor Only:**
- Editor: 100%

## Future Enhancements (Optional)

- [ ] Remember sidebar state in localStorage
- [ ] Keyboard shortcuts (Cmd+B for folders, Cmd+L for notes)
- [ ] Resize handles for custom widths
- [ ] Collapse animation direction (slide vs fade)
- [ ] Mobile-specific sidebar behavior
- [ ] Quick toggle all sidebars button
- [ ] Sidebar state per note (auto-collapse for long notes)

## Code Structure

### Component Hierarchy
```
Dashboard
├── Navigation Bar
│   └── Toggle controls (future: could add here too)
├── Main Content (flex container)
│   ├── Folder Sidebar (conditional)
│   ├── Show Folders Button (conditional)
│   ├── Notes Sidebar (conditional)
│   ├── Show Notes Button (conditional)
│   └── Editor Area (flex-1)
```

### State Flow
```
User clicks toggle → setState → Re-render → CSS transitions → Layout reflow
```

## Browser Compatibility
- Uses standard flexbox (all modern browsers)
- CSS transitions (all modern browsers)
- Absolute positioning for buttons (universal support)
- No vendor prefixes needed
- Works in Tauri desktop app

## Performance Notes
- Conditional rendering prevents unnecessary DOM
- CSS transitions hardware accelerated
- No JavaScript animation loops
- Minimal re-renders (only on state change)
- Smooth 60fps animations
