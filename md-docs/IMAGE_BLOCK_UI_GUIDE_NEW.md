# Image Block UI Guide

## Visual Overview

This document provides a visual guide to the enhanced image block UI.

## Image Block Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Image Block Container                                      │
│  (with alignment: left/center/right/full)                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ ┌─Toolbar (visible on hover)────────────┐  [Delete]  │ │
│  │ │ [←] [↔] [→] [⇔] [Crop]                │     ❌      │ │
│  │ └───────────────────────────────────────┘             │ │
│  │                                                        │ │
│  │  ●────────────●────────────●                          │ │
│  │  │            │            │                          │ │
│  │  │                         │                          │ │
│  │  ●    Image Content        ●    ← Resize Handles     │ │
│  │  │                         │       (8 total)          │ │
│  │  │                         │                          │ │
│  │  ●────────────●────────────●                          │ │
│  │                                                        │ │
│  │  Caption: [Editable text below image]                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Legend:
  [←] [↔] [→] [⇔] = Alignment buttons (left, center, right, full)
  [Crop]          = Crop mode button
  ❌              = Delete button
  ●               = Resize handles (corners and edges)
```

## Toolbar Buttons

### Alignment Buttons (Left Section)

```
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│  ←   │  │  ↔   │  │  →   │  │  ⇔   │
│ Left │  │Center│  │Right │  │ Full │
└──────┘  └──────┘  └──────┘  └──────┘
```

**Left Align**: Image floats left, text wraps around right
**Center Align**: Image centered, default behavior
**Right Align**: Image floats right, text wraps around left
**Full Width**: Image spans full editor width

### Action Buttons

```
┌──────┐  ┌──────┐
│  ✂   │  │  ❌  │
│ Crop │  │Delete│
└──────┘  └──────┘
```

## Resize Handles

Eight resize handles appear on hover:

```
●────────●────────●   
│                 │   ● = Corner handles (NW, NE, SW, SE)
●                 ●   ● = Edge handles (N, S, E, W)
│                 │   
●────────●────────●   

All handles maintain aspect ratio during resize
Min: 100px, Max: 4000px
```

## Crop Mode UI

When crop button is clicked:

```
┌─────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← Dark overlay
│ ░░░░┌─────────────────────────┐░░░░░░░░░░░░░░░ │
│ ░░░░│ ●──────●──────●         │░░░░░░░░░░░░░░░ │
│ ░░░░│ │               │        │░░░░░░░░░░░░░░░ │
│ ░░░░│ ●     Crop      ●        │░░░░░░░░░░░░░░░ │
│ ░░░░│ │     Area      │        │░░░░░░░░░░░░░░░ │ ← Crop area
│ ░░░░│ │               │        │░░░░░░░░░░░░░░░ │   (draggable)
│ ░░░░│ ●──────●──────●         │░░░░░░░░░░░░░░░ │
│ ░░░░└─────────────────────────┘░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░[Apply] [Cancel]░░░░░░░░░░░░░░░░░░░░ │ ← Action buttons
└─────────────────────────────────────────────────┘

Crop Area Controls:
- Drag center to move crop area
- Drag handles to resize crop area
- Constrained to image bounds
```

## Alignment Examples

### Left Aligned
```
┌────────────────────────────────────────┐
│ ┌────────┐                             │
│ │        │ Lorem ipsum dolor sit amet, │
│ │ Image  │ consectetur adipiscing elit,│
│ │        │ sed do eiusmod tempor      │
│ └────────┘ incididunt ut labore et    │
│            dolore magna aliqua.        │
│                                        │
└────────────────────────────────────────┘
```

### Center Aligned (Default)
```
┌────────────────────────────────────────┐
│                                        │
│         ┌──────────────┐               │
│         │              │               │
│         │    Image     │               │
│         │              │               │
│         └──────────────┘               │
│                                        │
│  Lorem ipsum dolor sit amet, consectetur│
│  adipiscing elit, sed do eiusmod tempor│
└────────────────────────────────────────┘
```

### Right Aligned
```
┌────────────────────────────────────────┐
│                             ┌────────┐ │
│ Lorem ipsum dolor sit amet, │        │ │
│ consectetur adipiscing elit,│ Image  │ │
│ sed do eiusmod tempor       │        │ │
│ incididunt ut labore et     └────────┘ │
│ dolore magna aliqua.                   │
│                                        │
└────────────────────────────────────────┘
```

### Full Width
```
┌────────────────────────────────────────┐
│ ┌────────────────────────────────────┐ │
│ │                                    │ │
│ │          Full Width Image          │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│  Lorem ipsum dolor sit amet, consectetur│
│  adipiscing elit, sed do eiusmod tempor│
└────────────────────────────────────────┘
```

## Interactive States

### Default State
```
┌────────────────────┐
│                    │
│      Image         │
│                    │
└────────────────────┘
No controls visible
```

### Hover State
```
┌────────────────────┐
│ [←][↔][→][⇔][✂] ❌ │ ← Toolbar appears
│  ●────●────●       │ ← Handles appear
│  │         │       │
│  ●  Image  ●       │
│  │         │       │
│  ●────●────●       │
│  Caption           │
└────────────────────┘
All controls visible with opacity animation
```

### Cropping State
```
┌────────────────────┐
│ ░░░░░░░░░░░░░░░░░░ │ ← Overlay
│ ░┌──────────┐░░░░░ │
│ ░│ ●──●──● │░░░░░ │ ← Crop handles
│ ░│ │     │ │░░░░░ │
│ ░│ ●  ●  ● │░░░░░ │
│ ░│ │     │ │░░░░░ │
│ ░│ ●──●──● │░░░░░ │
│ ░└──────────┘░░░░░ │
│ ░░░[✓][✗]░░░░░░░░ │ ← Apply/Cancel
└────────────────────┘
Resize handles hidden, crop UI active
```

## CSS Classes Reference

```css
.image-block-container     /* Outer container with alignment */
.image-block-wrapper       /* Inner wrapper for sizing */
.image-block-img           /* The actual image element */
.image-toolbar             /* Toolbar container */
.image-align-btn           /* Alignment buttons */
.image-crop-btn            /* Crop mode button */
.image-delete-btn          /* Delete button */
.image-resize-handle       /* Resize handle (8 instances) */
.image-caption             /* Caption text */
.crop-overlay              /* Crop mode overlay */
.crop-area                 /* Draggable crop region */
.crop-handle               /* Crop resize handles */
.crop-actions              /* Apply/Cancel buttons */
```
