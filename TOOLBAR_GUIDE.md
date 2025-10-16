# Drawing Editor Toolbar Guide

## 🎨 Complete Toolbar Reference

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Pen] [High] [Erase]  |  [⚫][🔵][🔴][🟢][🟣][🟠][🟡][🩷]  |  [Thin][Med][Thick][VThick]  |  [None][Grid][Lines][Dots]  │  [↶][↷][🗑️] | [💾⏷]
└──────────────────────────────────────────────────────────────────────────────┘
   Drawing Tools              Color Palette                Stroke Sizes              Background Patterns        Actions    Export
```

---

## 📍 Section 1: Drawing Tools (Left Side)

### 🖊️ **Pen** (Default)
- **Icon**: Pencil/Pen symbol
- **Use**: Standard drawing
- **Features**: 
  - Pressure sensitivity (on stylus)
  - Smooth strokes
  - Opaque lines
- **Shortcut**: (Future: P)

### 🖍️ **Highlighter**
- **Icon**: Marker symbol  
- **Use**: Transparent highlighting
- **Features**:
  - 30% opacity
  - Broader strokes
  - Great for emphasis
- **Shortcut**: (Future: H)

### ⌫ **Eraser**
- **Icon**: Eraser symbol
- **Use**: Remove mistakes
- **Features**:
  - Large contact area
  - Removes any stroke
  - Can't be undone (use Undo button instead)
- **Shortcut**: (Future: E)

---

## 🎨 Section 2: Color Palette (8 Colors)

| Color | Hex Code | Best For |
|-------|----------|----------|
| ⚫ Black | `#000000` | Text, outlines, general drawing |
| 🔵 Blue | `#2563eb` | Headings, important notes |
| 🔴 Red | `#dc2626` | Errors, warnings, highlights |
| 🟢 Green | `#16a34a` | Checkmarks, success, nature |
| 🟣 Purple | `#9333ea` | Creative elements, accents |
| 🟠 Orange | `#ea580c` | Alerts, emphasis |
| 🟡 Yellow | `#fbbf24` | Highlighting, sun, caution |
| 🩷 Pink | `#ec4899` | Decorative, soft highlights |

**Note**: Color selector disabled when Eraser is active

---

## 📏 Section 3: Stroke Sizes (4 Options)

### **Thin** (1x)
- Fine details
- Small annotations
- Precise line work

### **Medium** (2x) - Default
- General drawing
- Handwriting
- Balanced for most use

### **Thick** (4x)
- Bold lines
- Headers
- Emphasis

### **Very Thick** (6x)
- Large titles
- Shading
- Broad strokes

---

## 📐 Section 4: Background Patterns ⭐ NEW!

### **None** (Default)
```
┌─────────────┐
│             │  ← Clean white canvas
│             │
│             │
└─────────────┘
```

### **Grid**
```
┌─┬─┬─┬─┬─┬─┬─┐
├─┼─┼─┼─┼─┼─┼─┤  ← 20px squares
├─┼─┼─┼─┼─┼─┼─┤     Perfect for diagrams
├─┼─┼─┼─┼─┼─┼─┤
└─┴─┴─┴─┴─┴─┴─┘
```
**Best for**: Diagrams, charts, technical drawings, floor plans

### **Lines**
```
┌─────────────┐
├─────────────┤  ← 30px horizontal lines
├─────────────┤     Like lined paper
├─────────────┤
└─────────────┘
```
**Best for**: Handwritten notes, lists, journaling

### **Dots**
```
┌─────────────┐
│ · · · · · · │  ← 20px dot spacing
│ · · · · · · │     Subtle guidance
│ · · · · · · │
└─────────────┘
```
**Best for**: Sketching, bullet journaling, light guidance

---

## ⚡ Section 5: Actions (Right Side)

### ↶ **Undo**
- **Function**: Step backward through drawing history
- **Disabled**: When at oldest state
- **Keyboard**: Cmd/Ctrl+Z (Future)
- **Tip**: Can undo all the way to blank canvas

### ↷ **Redo**
- **Function**: Step forward through drawing history
- **Disabled**: When at newest state or no undo history
- **Keyboard**: Cmd/Ctrl+Shift+Z (Future)
- **Tip**: Only works after undo

### 🗑️ **Clear All**
- **Function**: Delete all strokes
- **Warning**: Can be undone with Undo button
- **Disabled**: When canvas is empty
- **Tip**: Use instead of erasing everything manually

---

## 💾 Section 6: Export Menu ⭐ NEW!

### Export Button (💾⏷)
Click to open export menu with two options:

#### **Export as PNG**
- **Format**: Raster image (pixels)
- **Size**: 800×600 pixels
- **Includes**: 
  - White background
  - Grid/Lines/Dots (if enabled)
  - All strokes with colors
  - Highlighter transparency
- **Best for**: 
  - Sharing via email/chat
  - Inserting in documents
  - Social media
  - Quick exports
- **File name**: `drawing-[timestamp].png`

#### **Export as SVG**
- **Format**: Vector image (scalable)
- **Size**: Scales to any size without quality loss
- **Includes**:
  - White background
  - Grid/Lines/Dots (if enabled)
  - All strokes as vector paths
  - Highlighter transparency
- **Best for**:
  - Professional documents
  - Printing at any size
  - Editing in Illustrator/Inkscape
  - High-resolution needs
- **File name**: `drawing-[timestamp].svg`

---

## 🖐️ Palm Rejection ⭐ NEW!

**How it works**:
- Automatically detects large touch contacts (palm)
- Ignores touches wider than 10px
- Allows precise stylus/finger touches
- Always allows stylus input

**Benefits**:
- Rest your palm naturally on the screen
- No accidental marks from palm touches
- Feels like drawing on real paper
- No settings needed - always active

**Device Support**:
- ✅ iPad with Apple Pencil
- ✅ Microsoft Surface with Surface Pen
- ✅ Android tablets with stylus
- ✅ Any device with pressure-sensitive stylus

---

## 💡 Quick Tips

### For Beginners:
1. Start with **Pen** tool, **Black** color, **Medium** size
2. Try **Lines** background for note-taking
3. Use **Undo** liberally - don't be afraid to experiment
4. Export as **PNG** for quick sharing

### For Power Users:
1. Use **Grid** for technical drawings
2. Combine **Highlighter** with **Pen** for emphasis
3. Switch backgrounds mid-drawing for different sections
4. Export as **SVG** for professional work

### Common Workflows:

**📝 Note-Taking:**
Lines background → Black pen → Medium size → Export PNG

**📊 Diagrams:**
Grid background → Multiple colors → Thin/Medium → Export SVG

**🎨 Sketching:**
None/Dots background → Various colors → All sizes → Export PNG

**📋 Annotating:**
Grid background → Red pen → Thick size → Export PNG

---

## ⌨️ Future Keyboard Shortcuts (Coming Soon)

| Key | Action |
|-----|--------|
| `P` | Switch to Pen |
| `H` | Switch to Highlighter |
| `E` | Switch to Eraser |
| `1-8` | Select color 1-8 |
| `[` | Decrease size |
| `]` | Increase size |
| `B` | Cycle backgrounds |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+S` | Save note |
| `Delete` | Clear all |

---

## 🎯 Feature Status

| Feature | Status | Priority |
|---------|--------|----------|
| Pen/Highlighter/Eraser | ✅ Complete | Core |
| 8 Color Palette | ✅ Complete | Core |
| 4 Stroke Sizes | ✅ Complete | Core |
| Undo/Redo | ✅ Complete | Core |
| Background Patterns | ✅ Complete | High |
| PNG Export | ✅ Complete | High |
| SVG Export | ✅ Complete | High |
| Palm Rejection | ✅ Complete | High |
| Pressure Sensitivity | ✅ Complete | Core |
| Keyboard Shortcuts | 🔄 Planned | Medium |
| Custom Colors | 🔄 Planned | Low |
| Shapes Tool | 🔄 Planned | Medium |
| Text Tool | 🔄 Planned | Medium |

---

Enjoy your fully-featured drawing editor! 🎨✨
