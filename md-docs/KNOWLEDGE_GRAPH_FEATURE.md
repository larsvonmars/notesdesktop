# Knowledge Graph Feature

## Overview

The Knowledge Graph feature provides a visual representation of all notes in your workspace and the connections between them through note links. It displays an interactive force-directed graph where nodes represent notes and edges represent links between notes.

## Features

### Folder Filtering
- **Dropdown Selector**: Choose which folder's notes to display
  - "All Notes": Shows all notes from all folders (default)
  - "Root Folder": Shows only notes in the root (not in any folder)
  - Any specific folder: Shows notes in that folder and all subfolders
- **Hierarchical Display**: Nested folders are indented in the dropdown
- **Smart Filtering**: When a folder is selected, all its subfolders are included
- **Persistent Selection**: Opens with your currently selected folder by default

### Visual Representation
- **Nodes**: Each note is represented as a circle
  - Size scales with the number of connections (both incoming and outgoing)
  - Color indicates note type:
    - Blue: Text notes
    - Purple: Drawing notes
    - Green: Mindmap notes
  - Current note is highlighted with yellow background and orange border
  - Label shows the note title
- **Edges**: Lines connecting notes represent note links
  - Directional arrows point from source to target note
  - Lines are drawn from edge to edge of nodes (not center to center)
  - Gray color with clear arrowheads for easy visualization

### Smart Positioning & Scaling
- **Golden-angle layout** initializes nodes in a pleasing spiral before physics simulation
- **Adaptive spacing** scales the initial layout based on total node count
- **Auto-fit zoom** calculates the ideal zoom level so the graph fills the viewport
- **Dynamic node radius** uses a capped square-root scale so hub notes stand out without overwhelming the canvas
- **Connection-aware separation** increases repulsion when nodes overlap to reduce clustering

### Interactive Controls
- **Click**: Click on any node to navigate to that note
- **Zoom**: Use mouse wheel to zoom in/out
- **Pan**: Click and drag on the canvas background to pan around
- **Reset View**: Button to reset zoom and pan to default

### Physics Simulation
The graph uses a force-directed layout algorithm that:
- Applies repulsion between nodes to spread them out
- Applies attraction along edges to keep connected nodes together
- Applies damping to stabilize the layout
- Animates to the equilibrium state

### Information Display
- **Stats**: Shows total number of filtered notes and total number of connections
- **Legend**: Explains node colors for different note types and current note highlight
- **Current Note Highlight**: The currently open note is highlighted with yellow background and orange border
- **Folder Context**: Dropdown shows which folder's notes are being displayed

## Usage

### Opening the Knowledge Graph

1. **From Unified Panel**: 
   - Click the floating menu button (top-right)
   - Click the "Knowledge Graph" button (purple gradient)
   - Or use keyboard shortcut when in the panel

2. **Button appears in the Browse tab**, between Search and All Notes sections

### Navigating

1. **View the Graph**: The modal opens with all notes displayed (or your current folder's notes)
2. **Filter by Folder**: Use the dropdown to view specific folders or all notes
3. **Find Notes**: 
   - Larger nodes have more connections
   - Colors indicate note type
   - Your current note is highlighted
3. **Navigate**: Click any node to open that note
4. **Explore**: Zoom and pan to see all connections
5. **Close**: Click outside the modal or the X button

## Implementation Details

### Component Structure

```typescript
<KnowledgeGraphModal
  isOpen={boolean}
  onClose={() => void}
  currentNoteId={string | undefined}
  onSelectNote={(note: Note) => void}
  folders={FolderNode[]}
  selectedFolderId={string | null}
/>
```

> The modal fetches all notes internally when opened, so a `notes` prop is no longer required.

### Graph Algorithm

The force-directed layout uses:
- **Golden-angle initial placement** to seed nodes around the center
- **Adaptive repulsion** that scales with total node count and connection overlap
- **Distance targeting** so connected nodes stabilize around an ideal spacing
- **Velocity damping & clamping** to avoid jitter and keep motion smooth
- **Auto-fit zoom** to keep the graph within the viewport after layout updates

### Link Detection

Links are extracted from note content by:
1. Parsing HTML content with DOMParser
2. Finding all `<span>` elements with `data-note-id` attribute
3. Building a connection map for visualization

### Performance

- Graph updates automatically when notes change
- Physics simulation runs until stable
- Canvas rendering is optimized for smooth animation

## Files Modified

### New Files
- `components/KnowledgeGraphModal.tsx` - Main graph visualization component

### Modified Files
- `components/UnifiedPanel.tsx` - Added Knowledge Graph button
- `components/NoteEditor.tsx` - Added modal integration and state management

## Future Enhancements

Potential improvements:
- Filter by note type or folder
- Search within the graph
- Export graph as image
- Show link strength (number of links between same notes)
- Clustering algorithm for large graphs
- Mini-map for navigation in large graphs
- Show note preview on hover
- Highlight paths between selected nodes
