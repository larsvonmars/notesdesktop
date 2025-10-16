# Mindmap Notes Feature

This document describes the Mindmap note type in the Notes Desktop application.

## Overview

Mindmap notes provide a visual way to organize ideas and concepts in a hierarchical, node-based structure. Each mindmap has a central idea with branching child nodes that can be expanded, collapsed, edited, and rearranged.

## Features

### Node Management
- **Central Node**: Every mindmap starts with a root node (Central Idea)
- **Add Children**: Click a node to select it, then use the + button to add child nodes
- **Edit Nodes**: Double-click any node to edit its text
- **Delete Nodes**: Select a node and click the trash icon to delete it (cannot delete root node)
- **Collapse/Expand**: Nodes with children can be collapsed to hide their subtrees

### Navigation & View
- **Pan**: Hold Shift/Cmd/Ctrl and drag, or use middle/right mouse button to pan
- **Zoom**: Use mouse wheel to zoom in/out
- **Drag Nodes**: Click and drag nodes to reposition them
- **Zoom Controls**: Use toolbar buttons for zoom in/out, reset view, or fit all nodes to view
- **Auto-positioning**: New child nodes are automatically positioned around their parent

### Visual Design
- **Color-coded Nodes**: Child nodes automatically get different colors
- **Curved Connections**: Lines connect parent and child nodes
- **Selection Highlighting**: Selected nodes have a highlighted border
- **Collapse Indicators**: Nodes with children show a +/- indicator

### Keyboard Shortcuts
- **Double-click**: Edit node text
- **Enter**: Save edited text
- **Escape**: Cancel editing
- **Cmd/Ctrl + S**: Save mindmap

## Data Structure

Mindmaps are stored as JSON in the note content field:

```json
{
  "rootId": "root",
  "nodes": {
    "root": {
      "id": "root",
      "text": "Central Idea",
      "x": 400,
      "y": 300,
      "parentId": null,
      "children": ["node-1", "node-2"],
      "collapsed": false,
      "color": "#3B82F6"
    },
    "node-1": {
      "id": "node-1",
      "text": "Child Node 1",
      "x": 550,
      "y": 250,
      "parentId": "root",
      "children": [],
      "collapsed": false,
      "color": "#10B981"
    }
  }
}
```

### Node Properties
- `id`: Unique identifier for the node
- `text`: The text content displayed in the node
- `x`, `y`: Position coordinates on the canvas
- `parentId`: ID of the parent node (null for root)
- `children`: Array of child node IDs
- `collapsed`: Whether the node's children are hidden
- `color`: Hex color code for the node background

## Creating a Mindmap Note

1. Click "New Mindmap" button in the sidebar (green button with Network icon)
2. Or select the mindmap option when creating a new note
3. The editor opens with a default "Central Idea" node

## Using the Mindmap Editor

### Basic Workflow
1. **Select** the central node by clicking it
2. **Add a child** using the + button in the toolbar
3. **Edit** the new node by double-clicking it
4. **Type** your idea and press Enter
5. **Repeat** to build your mindmap structure

### Advanced Features
- **Reorganize**: Drag nodes to better positions
- **Collapse**: Hide subtrees to focus on specific areas
- **Navigate**: Pan and zoom to explore large mindmaps
- **Reset View**: Use the reset button to return to default view
- **Fit to View**: Automatically scale and center all nodes

## Component Architecture

### MindmapEditor.tsx
The main mindmap editor component with:
- Canvas-based rendering using HTML5 Canvas API
- Interactive node manipulation
- Real-time updates
- Zoom and pan controls
- Edit dialog for text input

### Integration
- **NoteEditor.tsx**: Switches between rich-text, drawing, and mindmap editors
- **UnifiedPanel.tsx**: Provides "New Mindmap" button
- **NotesList.tsx**: Shows Network icon for mindmap notes
- **lib/notes.ts**: Includes 'mindmap' as a valid NoteType

## Color Palette

Default colors cycle through:
1. Blue (#3B82F6)
2. Green (#10B981)
3. Amber (#F59E0B)
4. Red (#EF4444)
5. Purple (#8B5CF6)
6. Pink (#EC4899)
7. Cyan (#06B6D4)
8. Orange (#F97316)

## Technical Details

### Canvas Rendering
- Uses HTML5 Canvas for performance with large mindmaps
- Implements efficient redrawing on changes
- Applies scaling and translation transformations for zoom/pan

### State Management
- React state for mindmap data
- Ref-based imperative API for parent components
- Real-time onChange callbacks for autosave

### Event Handling
- Mouse events for node interaction
- Wheel events for zooming
- Keyboard events for shortcuts

## Future Enhancements

Potential improvements:
- Export mindmap as image (PNG/SVG)
- Import/export in common mindmap formats
- Custom node colors and styles
- Node icons and emojis
- Connection labels
- Multiple root nodes
- Keyboard navigation (arrow keys to move between nodes)
- Touch support for tablets
- Collaborative editing
- Templates for common mindmap structures

## Tips for Best Results

1. **Start Simple**: Begin with a clear central idea
2. **Branch Logically**: Group related concepts together
3. **Keep Text Brief**: Use short, clear labels for nodes
4. **Use Collapse**: Hide branches you're not currently working on
5. **Reposition Often**: Drag nodes to keep your mindmap organized
6. **Save Frequently**: Use Cmd/Ctrl+S to save your work
