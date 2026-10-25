# MindViz Notes — Glass UI Redesign Spec (v1)

> Single source of truth for the UI/navigation overhaul. Every agent implements
> against this contract. If something here is impossible in your files, message
> the Lead instead of inventing a different visual language.

## 1. Vision

MindViz Notes should feel like a modern, premium notes app — the calm, layered
glass of Craft / Arc / Apple Notes, the speed and keyboard-first flow of Linear,
and the information architecture of Notion. References: Craft, Arc Browser,
Apple Notes, Notion, Bear, Linear, Raycast.

Principles
- **Content first.** Chrome recedes: translucent glass, thin hairline borders,
  soft large-radius shadows, one accent colour.
- **One obvious path.** Rail -> Library -> Note list -> Editor -> Details.
  Every screen answers 'where am I' (breadcrumbs) and 'how do I go back'
  (back/forward + Esc).
- **Keyboard-first, mouse-friendly.** Cmd/Ctrl+K search, Cmd+N new note,
  Cmd+1..5 views, Cmd+backslash sidebar, Cmd+Shift+D details, Cmd+[ / Cmd+] back/forward.
- **Motion is seasoning.** 150-260ms ease-out transitions, subtle lift on hover,
  never bouncy or distracting. Honour prefers-reduced-motion.
- **Both themes are first-class.** Light = airy frosted white over pastel
  aurora. Dark = deep midnight with luminous rim-light.

## 2. Shell architecture

Desktop (>= 1024px)

    +----------------------------------------------------------------------+
    | +----+ +---------------+ +----------------------------------------+ |
    | |Rail| |  Library      | | TopBar (breadcrumbs · search · actions) | |
    | | 68 | |  300 / 0      | +----------+-----------------------------+ |
    | |    | |  SidebarTree  | | NoteList |  Editor pane (NoteEditor)   | |
    | |    | |               | | 320 / 0  |  + Details sidebar          | |
    | +----+ +---------------+ +----------+-----------------------------+ |
    +----------------------------------------------------------------------+

- **Rail** (68px, always visible desktop): brand mark, primary destinations
  (Home, Notes, Tasks, Files), spacer, theme toggle, settings, avatar/sign-out.
  Active item = violet glass pill + left glow bar + tooltip.
- **Library** (300px, collapsible to 0): SidebarTree content. Collapse button in
  its header. Floating collapse/expand affordance when hidden.
- **TopBar** (56px): back/forward, breadcrumbs, search trigger, new-note
  button, note-list toggle, details toggle, overflow menu.
- **NoteList** (320px): grouped note list for the current folder/project/library.
- **Editor**: existing NoteEditor, restyled chrome (glass card, 24px radius,
  generous padding). Details sidebar stays a right glass panel.

Mobile (< 768px)
- 52px glass top bar (title + actions), full-height list or editor (not split).
- Bottom tab bar (Home, Notes, Search, Tasks, More) with safe-area padding.
- Library = left drawer over a scrim; tapping a note closes the list -> editor.
- Primary '+' affordance for new note.

Tablet (768-1023px): rail + library + content (list can overlay content when
narrow), details as overlay.

## 3. Tokens (owned by Lead — do not edit tokens.css / glass.css / tailwind.config.js)

Colors are declared as --x-rgb triplets and consumed as
rgb(var(--x-rgb) / <alpha-value>), so Tailwind opacity modifiers work.

Semantic names (unchanged, used everywhere): background, foreground, surface,
surface-hover, surface-active, border, border-strong, muted, accent,
accent-light, accent-foreground, success, warning, danger.

New CSS custom properties you may use directly:

    --glass-blur           /* 28px */
    --glass-blur-strong    /* 40px */
    --glass-highlight      /* inset top highlight colour */
    --glass-shadow         /* lifted shadow */
    --glass-shadow-lg      /* modal shadow */
    --rail-width: 68px
    --library-width: 300px
    --list-width: 320px
    --topbar-height: 56px
    --shell-radius-sm: 10px  --shell-radius: 16px  --shell-radius-lg: 24px
    --accent-glow

Light theme: surface = white 66%, borders = ink 8%, accent = violet #6757f5.
Dark theme: surface = white 6%, borders = white 10%, accent = #a394ff.

## 4. Reusable classes (defined in app/styles/glass.css)

Use these instead of re-deriving glass by hand. Combine with Tailwind for
layout/spacing only.

| class | purpose |
|---|---|
| .glass | base panel: translucent surface + backdrop blur + hairline border + top highlight |
| .glass-subtle | quieter variant for rail/background strips |
| .glass-strong | opaquer variant for popovers, modals, dropdowns, command palette |
| .glass-card | .glass + large radius + resting shadow; add .hover-lift for interactive cards |
| .glass-round | pill radius (rows, chips, icon buttons) |
| .glass-row | list row: radius, hover wash, focus-visible ring, active state |
| .glass-row[aria-current=page] / .is-active | accent-tinted selected row |
| .glass-input | inset search/text field |
| .glass-btn | neutral glass button |
| .glass-btn-primary | accent gradient button (violet->indigo), subtle glow |
| .glass-btn-ghost | borderless icon button with hover wash |
| .nav-pill | rail destination button; [aria-current=page] = active |
| .glass-divider | 1px hairline separator |
| .text-gradient | accent gradient text for hero/headings |
| .aurora / .aurora-orb / .noise | background layers (used by ShellBackground only) |
| .hover-lift | translateY(-2px) + shadow on hover |
| .kbd | keyboard keycap |
| .scroll-thin | (existing) slim scrollbar |
| .focus-ring | shared focus-visible ring |

Type scale
- Display: text-3xl/tight font-semibold tracking-[-0.02em]
- Section title: text-sm font-semibold tracking-[-0.01em]
- Body: text-sm leading-6
- Meta: text-[11px] font-medium uppercase tracking-[0.08em] text-muted

Radius/space rules
- Panels: 24px (rounded-3xl), popovers 16px (rounded-2xl), rows/chips 10-12px.
- Panel gutters: 12px desktop (8px mobile). Avoid hard 1px solid black borders.

## 5. Area-specific guidance

### A. Shell (Rail, TopBar, NoteList, MobileTabBar, EmptyEditor)
- New presentational components under components/shell/, typed via
  components/shell/types.ts. No data fetching, no auth, no Supabase imports.
- Rail: 68px, vertical, .glass-subtle; tooltips via title + accessible label.
- TopBar: sticky glass; breadcrumb 'Home / Project / Folder / Note' with
  middle-ellipsis at narrow widths.
- NoteList: grouped by Today / Yesterday / Previous 7 days / Older; row shows
  type icon, title, meta (relative time · project/folder). Compact/comfortable
  density toggle. Empty state with illustration + 'New note'.
- Keyboard: rows are buttons, arrow-key roving focus, Enter opens.
- Skeleton and empty states are part of the component.

### B. Library tree (SidebarTree.tsx)
- Keep every behaviour: search, filters, dnd, context menus, inline rename.
- Restyle rows to .glass-row, active row accent-tinted, section labels to the
  meta style, folder chevrons subtle, counts to text-muted.
- Header becomes brand + workspace title + collapse button (no duplicate logos).
- Keep DOM semantics/a11y attributes; keep aria labels stable — tests and other
  components depend on them.

### C. Views (HomeDashboard, TasksView, ProjectDashboard)
- Home = 'Today' dashboard: greeting hero, quick actions, recent notes as
  glass cards, agenda/task columns, project chips. Dense but calm.
- TasksView: glass kanban/agenda; keep all interactions (drag, complete, filters).
- ProjectDashboard: glass hero with project colour as soft tint, stat cards.
- Never hardcode white/slate backgrounds: use tokens + .glass*.

### D. Overlays & primitives (CommandPalette, BaseModal, ui/*, SettingsModal,
   ThemeToggle/Selector, ToastProvider, OfflineStatusIndicator,
   KeyboardShortcutsHelp, CookieConsentBanner, NewProjectModal,
   ArchivedProjectsModal)
- Command palette = Raycast-style glass sheet: 640px, centered at 14vh,
  blurred scrim, grouped results, kbd hints, no harsh borders.
- BaseModal: glass-strong, 24px radius, hairline border, backdrop blur + fade.
- ui/Button: add glass variants while keeping existing API/variants working.
- Focus management, Escape handling, ARIA must not regress.

### E. Editor chrome (NoteEditor.tsx top-level chrome only,
   NoteDetailsSidebar.tsx, editor/MobileNoteActions, SearchReplaceBar,
   SelectionToolbar, editor/SlashMenu, editor/TableToolbar, editor/LinkDialog,
   editor/LinkPopover, editor/GrammarPopover, editor/BlockControls)
- DO NOT change editor logic, commands, selection handling, autosave, or
  contenteditable markup. Restyle wrappers/toolbars only.
- Editor card: glass panel, 24px radius, title row with type chip + actions,
  content max-width ~72ch, comfortable padding.
- Floating toolbars: glass-strong, rounded-full, 4px inner padding, subtle
  entrance (reuse .floating-pop-in).
- Details sidebar: glass panel, sections with meta labels; keep all props.

### F. Auth & marketing (app/page.tsx, app/login, app/signup, app/share,
   components/SharedNoteView.tsx)
- Match the shell: aurora background, glass cards, gradient accent CTAs,
  refined typography, genuine product-feeling copy. No stock gradients soup.
- Keep form logic/auth calls intact; improve labels, spacing, error states.

## 6. Rules for every agent

1. **Stay in your files.** Do not edit app/styles/*, tailwind.config.js,
   app/layout.tsx, app/globals.css, components/WorkspaceShell.tsx unless
   assigned. If you need a new global class, message the Lead.
2. **No new dependencies.** lucide-react, Tailwind, existing libs only.
3. **Behaviour is sacred.** Same props, same callbacks, same keyboard shortcuts,
   same ARIA roles, same data flow. A visual refactor must not change logic.
4. **Typecheck** with npx tsc --noEmit before you report done. Fix your own
   errors only — if the error is another agent's file, report it to the Lead.
5. **Do not run next build, next dev, or any command that writes .next/ or
   touches the dev server.** The Lead owns the running app.
6. **Tailwind classes must exist.** Arbitrary values like bg-white/[0.06] are
   fine; prefer tokens (.glass, bg-surface, text-muted, ...).
7. **Dark mode**: check both :root and .dark. Never use text-black or bg-white
   for surfaces.
8. **Accessibility**: visible focus ring (.focus-ring), aria-current on active
   nav, aria-label on icon-only buttons, reduced-motion respected (CSS handles).
9. **Responsive**: verify at 1440, 1024, 768, 390 widths mentally; use
   hidden md:flex patterns rather than JS breakpoints where possible.
10. Report back with: files changed, what changed visually, anything you could
    not do, and any cross-scope issue.

## 7. Verification loop (Lead)

- During the redesign the Lead ran a temporary dev-only /preview harness (mock
  data, no auth) and captured headless Edge screenshots via the Chrome DevTools
  Protocol at desktop light/dark, laptop, tablet and true 390px mobile widths.
- That harness and its screenshots were removed before release; the curated
  results live in md-docs/ui-redesign/.
- Final gates: npx tsc --noEmit, npm run lint, npm test, npm run build.