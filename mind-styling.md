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

