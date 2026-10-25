'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  FolderTree,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Network,
  PenSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { useAuth } from '@/lib/auth-context'

const features = [
  {
    title: 'Every kind of note',
    description:
      'Rich text, mind maps, journals, data sheets, drawings, and annotated PDFs live in one library — no app-hopping required.',
    icon: PenSquare,
    tile: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20',
  },
  {
    title: 'Think in mind maps',
    description:
      'Grow ideas into draggable branches, then keep the structure as the thinking evolves.',
    icon: Network,
    tile: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20',
  },
  {
    title: 'Organised by context',
    description:
      'Folders, projects, and linked notes keep related work one click away from where you are.',
    icon: FolderTree,
    tile: 'bg-teal-500/10 text-teal-600 ring-teal-500/20 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20',
  },
  {
    title: 'AI beside your notes',
    description:
      'Summarise, draft, and reshape ideas in a panel next to the page — without leaving your train of thought.',
    icon: Bot,
    tile: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  },
  {
    title: 'Private by default',
    description:
      'Authentication and storage run through Supabase. Your workspace stays yours, and publishing is opt-in.',
    icon: ShieldCheck,
    tile: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20',
  },
]

const noteRows = [
  { title: 'Launch retrospective', meta: 'Product · 4m', active: true },
  { title: 'Q4 planning', meta: 'Work · 1h', active: false },
  { title: 'Reading notes — Shape Up', meta: 'Personal · Yesterday', active: false },
  { title: 'Onboarding audit', meta: 'Design · Mon', active: false },
]

const checklist = [
  { label: 'Finalise the onboarding checklist', done: true },
  { label: 'Link the release dashboard', done: true },
  { label: 'Draft the launch brief with AI summary', done: false },
]

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard')
    }
  }, [loading, user, router])

  // Signed-in visitors go straight to their workspace. The marketing page is
  // intentionally not blocked by the initial session check so it can be opened
  // and shared without authentication.
  if (user) {
    return (
      <main className="page-aurora flex min-h-screen items-center justify-center px-6">
        <ThemeToggle />
        <div className="glass-card animate-fade-in flex items-center gap-3 rounded-full px-5 py-3 text-sm font-medium text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Opening your workspace…
        </div>
      </main>
    )
  }

  return (
    <main
      aria-busy={loading || undefined}
      className="page-aurora relative min-h-screen overflow-x-hidden text-foreground"
    >
      <ThemeToggle />

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pb-4 pt-6 sm:px-8 sm:pt-8">
        <Link
          href="/"
          aria-label="MindViz Notes home"
          className="focus-ring group inline-flex items-center gap-2.5 rounded-2xl"
        >
          <img
            src="/icon-192.png"
            alt=""
            className="h-9 w-9 rounded-[10px] object-contain shadow-[0_10px_30px_-14px_var(--accent-glow)] ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.04] dark:ring-white/10"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
              MindViz Notes
            </span>
            <span className="mt-1 hidden text-[11px] font-medium text-muted sm:block">
              Desktop knowledge workspace
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2 pr-10 sm:gap-2.5 sm:pr-14">
          <Link href="/login" className="glass-btn focus-ring hidden sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="glass-btn-primary focus-ring">
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-14 pt-8 sm:px-8 sm:pb-20 sm:pt-12 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-10 xl:gap-14">
          <div className="animate-rise-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-light px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              A calmer workspace
            </span>

            <h1 className="mt-6 text-balance font-display text-[2.6rem] font-bold leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[2.9rem] xl:text-[3.5rem]">
              Your notes, maps, and plans —{' '}
              <span className="text-gradient">in one calm place</span>.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
              MindViz Notes is a desktop workspace for writing, thinking visually, and staying
              organised. Keep every format, project, and idea in one home that responds at the
              speed of thought.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="glass-btn-primary focus-ring h-12 px-6 text-sm">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="glass-btn focus-ring h-12 px-5 text-sm">
                <LayoutDashboard className="h-4 w-4" />
                Open your workspace
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
              <li className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" />
                Free to start
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" />
                No credit card
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" />
                Publish only when you choose
              </li>
            </ul>
          </div>

          {/* Product preview — composed panels, illustrative only */}
          <div className="relative mt-2 lg:mt-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] opacity-70 blur-3xl"
              style={{ background: 'var(--aurora-1)' }}
            />

            <div
              role="img"
              aria-label="Product preview: a MindViz note called Launch retrospective with a checklist, a note list, and an AI summary panel."
              className="glass-card animate-rise-in relative overflow-hidden"
              style={{ animationDelay: '120ms' }}
            >
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                <span aria-hidden className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                </span>
                <div className="ml-2 hidden min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-sunken px-3 py-1.5 text-[11px] text-muted sm:flex">
                  <Search className="h-3 w-3 shrink-0" />
                  <span className="truncate">Search notes, projects, people</span>
                  <kbd className="kbd ml-auto">⌘K</kbd>
                </div>
                <span className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-lg bg-accent-light text-accent sm:ml-0">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="flex">
                {/* Rail */}
                <div className="hidden w-12 shrink-0 flex-col items-center gap-1.5 border-r border-border py-3 sm:flex">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-muted">
                    <LayoutDashboard className="h-4 w-4" />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent-light text-accent">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-muted">
                    <ListChecks className="h-4 w-4" />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-muted">
                    <FolderTree className="h-4 w-4" />
                  </span>
                  <span className="mt-auto inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-muted">
                    <Settings className="h-4 w-4" />
                  </span>
                </div>

                {/* Note list */}
                <div className="hidden w-[150px] shrink-0 border-r border-border p-2.5 xl:block">
                  <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Today
                  </p>
                  <div className="space-y-0.5">
                    {noteRows.map((row) => (
                      <div
                        key={row.title}
                        className={`min-w-0 rounded-lg px-2 py-1.5 ${
                          row.active ? 'bg-accent-light' : ''
                        }`}
                      >
                        <p
                          className={`truncate text-[11px] font-medium leading-4 ${
                            row.active ? 'text-accent' : 'text-foreground'
                          }`}
                        >
                          {row.title}
                        </p>
                        <p className="truncate text-[10px] leading-4 text-muted">{row.meta}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editor */}
                <div className="min-w-0 flex-1 p-3.5 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
                    <span>Notes</span>
                    <span className="text-border-strong">/</span>
                    <span>Product</span>
                    <span className="text-border-strong">/</span>
                    <span className="truncate text-foreground">Launch retrospective</span>
                  </div>

                  <h3 className="mt-2.5 truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    Launch retrospective
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-medium text-accent">
                      Work
                    </span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-muted">
                      Week 12
                    </span>
                    <span className="text-[10px] text-muted">Edited 4m ago</span>
                  </div>

                  <p className="mt-3 text-[11px] leading-[1.65] text-muted">
                    The launch landed smoothly. Three decisions came out of the retro, and two of
                    them need owners before Friday.
                  </p>

                  <div className="mt-3 space-y-1.5">
                    {checklist.map((item) => (
                      <div key={item.label} className="flex items-start gap-2">
                        <span
                          className={`mt-[1px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] ${
                            item.done
                              ? 'bg-accent text-accent-foreground'
                              : 'border border-border-strong'
                          }`}
                        >
                          {item.done ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                        <span
                          className={`text-[11px] leading-4 ${
                            item.done ? 'text-muted line-through' : 'text-foreground'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-2.5 text-[10px] text-muted">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-surface-sunken text-muted">
                      <Sparkles className="h-2.5 w-2.5" />
                    </span>
                    Linked: Onboarding checklist · Release dashboard
                  </div>
                </div>
              </div>
            </div>

            {/* Floating AI panel */}
            <div className="absolute -bottom-7 -left-3 z-10 hidden w-56 -rotate-1 xl:block">
              <div className="glass-strong animate-rise-in p-3.5" style={{ animationDelay: '300ms' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <Sparkles className="h-3 w-3 text-accent" />
                  AI summary
                </div>
                <p className="mt-1.5 text-[11px] leading-[1.6] text-foreground">
                  Three decisions, two owners, one open question — the launch is on track for
                  Friday.
                </p>
                <div className="mt-2 flex items-center justify-between rounded-md bg-surface-sunken px-2 py-1 text-[10px] text-muted">
                  <span>Ask about this note…</span>
                  <kbd className="kbd">↵</kbd>
                </div>
              </div>
            </div>

            {/* Floating mind map panel */}
            <div className="absolute -right-3 top-10 z-10 hidden w-44 rotate-1 xl:block">
              <div className="glass-strong animate-rise-in p-3" style={{ animationDelay: '420ms' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <Network className="h-3 w-3 text-accent" />
                  Launch map
                </div>
                <div className="mt-2 space-y-1">
                  <span className="inline-flex rounded-md bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    Launch
                  </span>
                  <div className="ml-2 space-y-1 border-l border-border pl-2">
                    <div>
                      <span className="inline-flex rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                        Messaging
                      </span>
                    </div>
                    <div>
                      <span className="inline-flex rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                        Metrics
                      </span>
                    </div>
                    <div>
                      <span className="inline-flex rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                        Research
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section
        id="features"
        className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-8 px-5 pb-16 sm:px-8 sm:pb-20"
      >
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Built for deep work
          </p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-4xl">
            One workspace. Every kind of thinking.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base sm:leading-7">
            Move from a quick capture to a structured plan without changing tools — the format
            changes, the workspace stays the same.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isFeatureSpotlight = index === 0

            return (
              <article
                key={feature.title}
                className={`glass-card hover-lift animate-fade-in flex flex-col p-5 sm:p-6 ${
                  isFeatureSpotlight ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
                style={{ animationDelay: `${80 + index * 60}ms` }}
              >
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset ${feature.tile}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-[-0.01em] text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1.5 max-w-xl text-[13px] leading-6 text-muted">
                  {feature.description}
                </p>

                {isFeatureSpotlight ? (
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                    {['Rich text', 'Mind maps', 'Journal', 'Data sheet', 'Drawing', 'PDF notes'].map(
                      (label) => (
                        <span
                          key={label}
                          className="rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-muted"
                        >
                          {label}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="glass-card relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-60 blur-3xl"
            style={{ background: 'var(--aurora-1)' }}
          />
          <div className="relative">
            <div className="flex justify-center">
              <img
                src="/icon-192.png"
                alt=""
                className="h-12 w-12 rounded-2xl object-contain ring-1 ring-black/5 dark:ring-white/10"
              />
            </div>
            <h2 className="mt-5 text-balance font-display text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl">
              Start with one note. Build from there.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted sm:text-base">
              A calm home for everything between the first idea and the finished plan.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="glass-btn-primary focus-ring h-12 px-6 text-sm">
                Create your workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="glass-btn focus-ring h-12 px-5 text-sm">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">Free to start · No credit card required</p>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 pb-10 pt-4 text-xs text-muted sm:flex-row sm:px-8">
        <div className="flex items-center gap-2">
          <img src="/icon-192.png" alt="" className="h-5 w-5 rounded-md object-contain ring-1 ring-black/5 dark:ring-white/10" />
          <span>MindViz Notes · Desktop knowledge workspace</span>
        </div>
        <nav aria-label="Footer" className="flex items-center gap-5">
          <Link href="/login" className="focus-ring rounded transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="focus-ring rounded transition-colors hover:text-foreground">
            Create account
          </Link>
          <Link href="#features" className="focus-ring rounded transition-colors hover:text-foreground">
            Features
          </Link>
        </nav>
      </footer>
    </main>
  )
}
