# MindViz Notes Styling Replication Guide

Use this as the source-of-truth guide to recreate the same visual branding in another app.

## 1. Brand DNA (What makes the UI feel like MindViz Notes)

1. Calm productivity palette:
- Light mode uses slate neutrals with green as the primary action accent.
- Dark mode uses warm charcoal neutrals with a brighter green accent.

2. Surface model:
- Most UI sits on soft card layers (white or charcoal) with subtle borders.
- Frosted or translucent surfaces appear in key areas using backdrop blur.

3. Motion tone:
- Use gentle reveal and pop animations, not bouncy or flashy movement.
- Keep durations around 500-700ms and use smooth easing.

4. Shape language:
- Rounded corners are prominent (`rounded-xl`, `rounded-2xl`, `rounded-3xl`).
- Pills (`rounded-full`) are used for badges and compact CTAs.

5. Typography:
- Primary font: Geist Sans.
- Monospace/supporting font: Geist Mono.

## 2. Core Design Tokens

Copy these token values exactly if you want a near-identical brand feel.

```css
:root {
	--background:        #f8fafc;
	--foreground:        #0f172a;
	--surface:           #ffffff;
	--surface-hover:     #f1f5f9;
	--surface-active:    #e2e8f0;
	--border:            #e2e8f0;
	--border-strong:     #cbd5e1;
	--muted:             #64748b;
	--accent:            #16a34a;
	--accent-light:      #dcfce7;
	--accent-foreground: #ffffff;
	--success:           #10b981;
	--success-light:     #d1fae5;
	--warning:           #f59e0b;
	--warning-light:     #fef3c7;
	--danger:            #ef4444;
	--danger-light:      #fee2e2;
}

:root.dark {
	--background:        #0c0a09;
	--foreground:        #e7e5e4;
	--surface:           #1c1917;
	--surface-hover:     #292524;
	--surface-active:    #44403c;
	--border:            #292524;
	--border-strong:     #44403c;
	--muted:             #a8a29e;
	--accent:            #22c55e;
	--accent-light:      #052e16;
	--accent-foreground: #ffffff;
	--success:           #34d399;
	--success-light:     #064e3b;
	--warning:           #fbbf24;
	--warning-light:     #78350f;
	--danger:            #f87171;
	--danger-light:      #7f1d1d;
	color-scheme: dark;
}
```

## 3. Tailwind Theme Mapping

Map semantic Tailwind colors to CSS variables so your components stay brand-consistent.

```js
// tailwind.config.js
module.exports = {
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				background: 'var(--background)',
				foreground: 'var(--foreground)',
				surface: 'var(--surface)',
				'surface-hover': 'var(--surface-hover)',
				'surface-active': 'var(--surface-active)',
				border: 'var(--border)',
				'border-strong': 'var(--border-strong)',
				muted: 'var(--muted)',
				accent: 'var(--accent)',
				'accent-light': 'var(--accent-light)',
				'accent-foreground': 'var(--accent-foreground)',
				success: 'var(--success)',
				'success-light': 'var(--success-light)',
				warning: 'var(--warning)',
				'warning-light': 'var(--warning-light)',
				danger: 'var(--danger)',
				'danger-light': 'var(--danger-light)',
			},
		},
	},
}
```

## 4. Global Foundation Styles

Add these basics in your global stylesheet:

```css
body {
	min-height: 100vh;
	background: var(--background);
	color: var(--foreground);
	font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
	overscroll-behavior: none;
	-webkit-text-size-adjust: 100%;
}

.alpine-surface {
	background: rgb(255 255 255 / 0.8);
	backdrop-filter: blur(4px);
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

## 5. Theme Switching Contract

Use this behavior to match the current app:

1. Support `light`, `dark`, and `system` modes.
2. Persist preference in `localStorage` under key `theme`.
3. Resolve `system` via `prefers-color-scheme`.
4. Apply/remove `.dark` on `document.documentElement`.
5. Include a tiny pre-hydration script in `<head>` to prevent theme flash.

Minimal script pattern:

```html
<script>
	(function () {
		try {
			var t = localStorage.getItem('theme')
			var d = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme:dark)').matches)
			if (d) document.documentElement.classList.add('dark')
		} catch (e) {}
	})()
</script>
```

## 6. Component Recipe Library (Copy these patterns)

1. Primary CTA:
- `rounded-2xl`, green background, white text, medium shadow.
- Hover: darken green + slight upward lift.

2. Secondary button:
- White/near-surface background, subtle border, darker border on hover.

3. Card:
- `rounded-3xl border bg-white/90 dark:bg-slate-900/85` with soft elevated shadow.

4. Badges/chips:
- `rounded-full`, uppercase micro text, spaced letter tracking.

5. Toolbar pills:
- Light border, compact spacing, tiny uppercase labels.

6. Input and modal surfaces:
- Border-led separation first, shadow second.
- In dark mode, keep backgrounds distinct enough from page background.

## 7. Background + Atmosphere

To reproduce the brand mood:

1. Use radial gradient backgrounds rather than flat fills.
2. Add 2-3 blurred color blobs at low opacity.
3. Keep contrast readable; atmosphere should not reduce legibility.

Example direction:

```css
/* Light */
background: radial-gradient(circle at 20% 0%, #dcfce7 0%, #f8fafc 38%, #dbeafe 100%);

/* Dark */
background: radial-gradient(circle at 20% 0%, #14532d 0%, #020617 45%, #0f172a 100%);
```

## 8. Motion System

Use these three animation roles:

1. Fade up (`landingFadeUp`): section and card entrances.
2. Node pop (`landingNodePop`): visual items (nodes/chips) appearing in sequence.
3. Link draw (`landingLinkDraw`): connector lines animating into place.

Guidelines:

1. Stagger by ~80-120ms between siblings.
2. Use `cubic-bezier(0.2, 0.65, 0.2, 1)` for natural motion.
3. Keep transforms subtle (`translateY(8-10px)`, scale from ~0.92).

## 9. Spacing, Radius, and Shadows

Use this practical scale for consistency:

1. Page section horizontal padding: `px-6`.
2. Content max width: `max-w-6xl` for major landing/dashboard sections.
3. Card padding: usually `p-6` to `p-8`.
4. Radius scale:
- small controls: `rounded-md` to `rounded-xl`
- primary surfaces: `rounded-2xl`
- hero/promo cards: `rounded-3xl` or custom (`rounded-[2rem]`)

5. Shadow style:
- Prefer soft, wide, low-alpha shadows over sharp elevation.

## 10. Accessibility + Platform Notes

Keep these behaviors to preserve quality:

1. Maintain touch targets of at least 44x44.
2. Include safe-area utility classes for mobile/webview shells.
3. Use antialiased text and avoid ultra-thin font weights on dark backgrounds.
4. Keep contrast strong for text on translucent cards.

## 11. Quick Replication Checklist

1. Import Geist Sans + Geist Mono.
2. Add light/dark CSS tokens exactly.
3. Wire Tailwind semantic colors to tokens.
4. Implement `theme` preference (`light|dark|system`) + root `.dark` class.
5. Add radial atmospheric background style.
6. Apply rounded card + border + blur + soft shadow component patterns.
7. Add the three key entrance/link animations.
8. Verify both light and dark mode before shipping.

## 12. What to Avoid (to keep brand fidelity)

1. Do not switch accent away from green unless intentionally rebranding.
2. Do not use hard black/white everywhere; keep nuanced neutrals.
3. Do not overuse heavy shadows or fast bouncy animations.
4. Do not mix unrelated radius systems (e.g., sharp cards + pill controls).
5. Do not break semantic token mapping by hardcoding many one-off colors.

---

## 13. General App Structure

This section documents the structural skeleton of the app — how the shell, sidebars, menus, and modals are assembled — so the layout can be replicated faithfully.

### 13.1 Shell Layout

The root shell is a full-screen flex column (`min-h-screen flex flex-col`). Inside it:

```
Root shell  (min-h-screen flex flex-col)
 ├── SidebarTree              [desktop only, fixed left, z-40]
 ├── Mobile header bar        [mobile only, fixed top, z-40]
 ├── Mobile slide-out drawer  [mobile only, conditional mount, z-50]
 └── main  (flex-1 w-full h-screen overflow-hidden)
      └── active view (Welcome / Notes / Files / Projects)
```

The main content area receives horizontal padding via a CSS variable `--workspace-sidebar-offset` (64px collapsed, 280px expanded), applied as an inline `paddingLeft` style so it reacts to sidebar state without a hard-coded breakpoint.

On mobile, the sidebar is replaced by a fixed top header and a slide-out drawer panel (`w-[280px]`, `z-50`) overlaid over a semi-transparent backdrop (`bg-black/40`, `z-40`). The drawer opens/closes by mounting/unmounting (no CSS slide animation). A left-edge swipe gesture (`clientX ≤ 28, dx > 72`) also opens it.

### 13.2 Left Sidebar (SidebarTree)

The sidebar has two width states — **collapsed** (icon rail, `w-14`) and **expanded** (`w-[280px]`):

```
aside  (fixed inset-y-0 left-0 z-40, transition-all duration-300)
 ├── Header row           (logo + title + expand-all + collapse toggle)
 ├── Search bar           (rounded-xl, bg-surface-hover/50, icon prefix)
 ├── Filter panel         (conditional, note-type + project chips)
 ├── Scrollable tree body (flex-1 overflow-y-auto)
 │    └── Projects → Folders → Notes  (recursive indent)
 └── Footer               (settings + sign-out)
```

**Collapsed icon-rail** shows only a gradient logo avatar and project color dots; an active project item gets `scale-105 ring-2 ring-offset-2 shadow-md`.

Key classes:

| Element | Classes |
|---|---|
| `<aside>` | `fixed inset-y-0 left-0 z-40 hidden lg:flex lg:flex-col border-r border-border/40 bg-surface transition-all duration-300` |
| Search input | `pl-8 pr-7 py-2 text-xs rounded-xl bg-surface-hover/50 focus:ring-2 focus:ring-alpine-500/25` |
| Selected note | `bg-alpine-50 dark:bg-alpine-900/30 text-alpine-700` |
| Drag drop-zone | `ring-2 ring-alpine-400/50 bg-alpine-50/20` |
| Filter badge | `absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-alpine-600 text-white text-[9px] rounded-full` |

### 13.3 Right Details Sidebar (NoteDetailsSidebar)

A second sidebar lives on the right edge and is also collapsible:

```
aside  (fixed inset-y-0 right-0 z-30, transition-all duration-300)
 ├── Header  ("Details" label + note title + collapse chevron)
 └── Scrollable body  (flex-1 overflow-y-auto)
      ├── Title input
      ├── Save / Delete actions
      ├── Metadata  (type, folder, project)
      ├── Statistics grid  (2-col: words / chars)
      ├── Word-goal progress bar
      ├── Table of Contents  (collapsible, level-indent via paddingLeft)
      ├── Connections  (backlinks + outgoing links)
      ├── AI Assistant shortcut
      └── Export / Share actions
```

Width states: collapsed `w-12`, expanded `w-[280px]`. It sits at `z-30` — below modal layers and the left sidebar.

Key details:

| Element | Classes |
|---|---|
| `<aside>` | `fixed inset-y-0 right-0 z-30 hidden lg:flex lg:flex-col border-l border-border/40 bg-surface transition-all duration-300` |
| Section label | `text-[10px] font-semibold text-muted/60 uppercase tracking-widest` |
| Title input | `px-3 py-2 text-sm rounded-xl bg-surface-hover/40 border-0 focus:ring-2 focus:ring-alpine-500/25` |
| Save button | `bg-gradient-to-r from-alpine-600 to-alpine-500 text-white rounded-xl hover:shadow-md` |
| Delete button | `text-danger bg-danger-light/60 hover:bg-danger hover:text-white` |
| Stats cell | `bg-surface-hover/30 rounded-xl px-2.5 py-2.5 text-center` |
| Word-goal bar track | `h-2.5 bg-surface-hover/50 rounded-full overflow-hidden` |
| Word-goal bar fill | `bg-gradient-to-r from-alpine-400 to-alpine-500` (done: `from-green-400 to-green-500`) |
| Unsaved dot | `w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse` |
| ToC chevron | `transition-transform duration-200 rotate-90` (expanded) |

### 13.4 Modals (BaseModal)

All modals share a single `BaseModal` primitive with two render modes:

**Overlay mode** (standard dialog):
```
div.fixed.inset-0  (backdrop, bg-black/60, flex items-center justify-center, p-3 sm:p-6)
 └── div  (card: w-full {max-w-*} rounded-2xl shadow-2xl border flex flex-col overflow-hidden)
      ├── ModalHeader   (shrink-0, border-b, gradient fill)
      │    ├── Icon + title slot
      │    └── ModalCloseButton  (×)
      ├── ModalBody     (flex-1 overflow-y-auto, px-4 sm:px-6 py-4 sm:py-5)
      └── ModalFooter   (shrink-0, border-t)
```

**`asView` mode**: renders as a full-height panel (`h-full w-full flex flex-col overflow-hidden bg-background`) without a backdrop, used when embedding a modal-style UI directly into the main content area.

Size variants (`size` prop):

| Value | Max-width class |
|---|---|
| `'sm'` | `max-w-sm` |
| `'md'` | `max-w-md` |
| `'lg'` | `max-w-lg` |
| `'xl'` | `max-w-xl` |
| `'2xl'` | `max-w-2xl` |
| `'3xl'` | `max-w-3xl` |
| `'full'` | `max-w-full h-full` |

Entry animations (controlled via `animation` prop):

| Value | Classes applied to card |
|---|---|
| `'fade'` (default) | `animate-in fade-in duration-200` |
| `'zoom'` | `animate-in fade-in zoom-in-95 duration-200` |
| `'none'` | — |

Default close behaviors: `Escape` key and backdrop click (both opt-out via props). Z-index is prop-controlled (default `50`).

Key classes:

| Slot | Classes |
|---|---|
| Backdrop | `fixed inset-0 flex items-center justify-center p-3 sm:p-6 bg-black/60` |
| Card | `bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700` |
| Header | `px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-slate-700 shrink-0` |
| Header gradient | `bg-gradient-to-r from-white to-gray-50 dark:from-slate-900 dark:to-slate-800` |
| Title | `text-lg font-semibold text-gray-900 dark:text-slate-100` |
| Body | `flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5` |
| Footer | `border-t border-gray-200 dark:border-slate-700 px-4 sm:px-6 py-3 sm:py-4 shrink-0` |

### 13.5 Context Menus

Context menus are positioned absolutely at the mouse cursor using `fixed` positioning with `x`/`y` coordinates stored in state. They always render as a two-layer stack:

```
div.fixed.inset-0.z-50          (invisible backdrop, click-to-dismiss)
div.fixed.z-[60]  (style: top/left from cursor coords)
  min-w-[200px] max-h-[400px] overflow-y-auto rounded-2xl shadow-2xl border bg-surface
   └── list of action rows  (hover:bg-surface-hover, text-sm)
```

Role-based visual cues:
- Destructive actions (delete) use `text-danger`.
- Separator groups use a `border-t border-border/40` divider.

### 13.6 Z-Index Layering Reference

The full stacking order from back to front:

| Layer | Z-index | Element |
|---|---|---|
| Right details sidebar | `z-30` | `NoteDetailsSidebar` |
| Left sidebar + mobile header | `z-40` | `SidebarTree`, mobile `<header>` |
| Mobile backdrop | `z-40` | dim overlay behind drawer |
| Mobile drawer | `z-50` | slide-out `<aside>` |
| Modals (default) | `z-50` | `BaseModal` backdrop |
| Context menu backdrop | `z-50` | click-dismiss layer |
| Context menu card | `z-[60]` | positioned menu card |
| Note type picker overlay | `z-[60]` | full-screen type picker |
| Move / delete confirmations | `z-[70]` | sub-modal overlays |
| File preview modal | `z-[120]` | deep nested preview |

### 13.7 Active View Switching

The main content area renders one active view at a time, controlled by an `activeView` state string:

| Value | Renders |
|---|---|
| `'welcome'` | Welcome/onboarding screen |
| `'notes'` | Note editor + details sidebar |
| `'files'` | File explorer panel |
| `'projects'` | Project dashboard |

Transitions between views are instant (mount/unmount, no CSS transition). Use `animate-in fade-in duration-200` on the entering view if you want a soft reveal.

