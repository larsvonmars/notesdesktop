'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  ArrowRight,
  Bot,
  FileText,
  FolderTree,
  LayoutDashboard,
  Maximize2,
  Minus,
  Move,
  Network,
  PenSquare,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { useAuth } from '@/lib/auth-context'

const features = [
  {
    title: 'Multi-format notes',
    description: 'Create rich text docs, mind maps, bullet journals, project dashboards, and annotated PDFs in one workspace.',
    icon: PenSquare,
  },
  {
    title: 'Mindmap editor',
    description: 'Drag ideas into visual clusters, create branches, and evolve complex thinking without losing structure.',
    icon: Network,
  },
  {
    title: 'Organized knowledge graph',
    description: 'Structure notes with folders, projects, links, and visual relationships so context is always one click away.',
    icon: FolderTree,
  },
  {
    title: 'Smart writing support',
    description: 'Use the integrated AI assistant to summarize, draft, and iterate ideas directly next to your notes.',
    icon: Bot,
  },
  {
    title: 'Safe and private by default',
    description: 'Authentication and row-level access keep your personal workspace private while allowing deliberate sharing.',
    icon: ShieldCheck,
  },
]

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard')
    }
  }, [loading, user, router])

  if (loading || user) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#dbfce7_0%,#f8fafc_38%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_20%_0%,#14532d_0%,#020617_45%,#0f172a_100%)]">
        <ThemeToggle />
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
          <div className="rounded-full border border-white/80 bg-white/85 px-5 py-3 text-sm font-medium text-slate-700 shadow-lg backdrop-blur dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-100">
            Opening your workspace...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_20%_0%,#dcfce7_0%,#f8fafc_38%,#dbeafe_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,#14532d_0%,#020617_45%,#0f172a_100%)] dark:text-slate-100">
      <ThemeToggle />

      <section className="relative isolate px-6 pb-16 pt-24 sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-24 top-8 h-56 w-56 rounded-full bg-emerald-300/35 blur-3xl dark:bg-emerald-500/25" />
          <div className="absolute right-0 top-20 h-64 w-64 rounded-full bg-sky-300/35 blur-3xl dark:bg-cyan-500/20" />
          <div className="absolute bottom-4 left-1/3 h-48 w-48 rounded-full bg-amber-200/35 blur-3xl dark:bg-amber-400/15" />
        </div>

        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="MindViz Notes" className="h-10 w-10" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 dark:text-slate-200">MindViz Notes</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">Desktop knowledge workspace</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur transition hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:bg-slate-900/85 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
              >
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] landing-fade-up">
            <div className="landing-fade-up" style={{ animationDelay: '80ms' }}>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                <Sparkles className="h-4 w-4" />
                Everything for serious note-taking
              </p>
              <h1 className="text-balance text-4xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-5xl">
                Build your second brain with notes, structure, and visual thinking.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-700 dark:text-slate-200 sm:text-lg">
                MindViz Notes combines writing, diagrams, planning tools, and AI assistance in a single workspace designed for deep work.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                >
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Open dashboard
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_40px_120px_-50px_rgba(15,23,42,0.5)] backdrop-blur sm:p-8 dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-[0_40px_120px_-50px_rgba(2,6,23,0.95)] landing-fade-up" style={{ animationDelay: '160ms' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 dark:text-slate-300">Live feature preview</p>
              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                  <FileText className="h-4 w-4" />
                  Text Note Demo
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sprint Planning - Week 12</h2>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Objectives</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-800 dark:text-slate-100">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Finalize onboarding checklist and create guidance docs
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Link related notes and decisions to release dashboard
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Draft launch brief with AI-assisted summary
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white sm:text-3xl">Feature demos you can explore after signup</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700 dark:text-slate-200 sm:text-base">
            The workspace is built for writing and visual thinking together. Here is a realistic preview of text notes and the mindmap editor.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-[0_20px_60px_-40px_rgba(2,6,23,0.9)] landing-fade-up" style={{ animationDelay: '240ms' }}>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <FileText className="h-4 w-4" />
                Text Notes Editor
              </div>
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Write structured notes quickly</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                Rich formatting, checklists, linked references, and project tags let you move from rough ideas to clean plans.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-950">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium dark:bg-slate-800 dark:text-slate-100">H1</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium dark:bg-slate-800 dark:text-slate-100">Bold</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium dark:bg-slate-800 dark:text-slate-100">Checklist</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium dark:bg-slate-800 dark:text-slate-100">Link Note</span>
                </div>
                <h4 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">Launch Retrospective</h4>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  This sprint showed stronger handoff quality after linking requirements and design notes directly inside the editor.
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-100">
                  <p className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border border-emerald-500 bg-emerald-500/10" />
                    Keep shared checklists for QA and release owners
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-900" />
                    Add one-click links to architecture notes
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-[0_30px_90px_-50px_rgba(2,6,23,0.95)] landing-fade-up" style={{ animationDelay: '320ms' }}>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200">
                <Network className="h-4 w-4" />
                Mindmap Editor Demo
              </div>
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Map strategy visually with draggable branches</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                Expand ideas, create child nodes, and see relationships instantly. This is ideal for planning sessions and research breakdowns.
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-600 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-200">
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">Select</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">Node</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">Branch</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">Color</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-200">
                    <button type="button" aria-label="Zoom out" className="rounded-md border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">125%</span>
                    <button type="button" aria-label="Zoom in" className="rounded-md border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Fit map" className="rounded-md border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative h-[300px] bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:24px_24px] p-4 dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)]">
                  <svg className="pointer-events-none absolute inset-0 h-full w-full text-slate-400 dark:text-slate-500" viewBox="0 0 600 340" fill="none" aria-hidden>
                    <path className="landing-link-draw" style={{ animationDelay: '320ms' }} d="M292 170 C 330 170, 350 110, 395 95" stroke="currentColor" strokeWidth="2.5" />
                    <path className="landing-link-draw" style={{ animationDelay: '420ms' }} d="M292 170 C 340 170, 356 170, 412 170" stroke="currentColor" strokeWidth="2.5" />
                    <path className="landing-link-draw" style={{ animationDelay: '520ms' }} d="M292 170 C 330 175, 350 240, 395 255" stroke="currentColor" strokeWidth="2.5" />
                    <path className="landing-link-draw" style={{ animationDelay: '620ms' }} d="M212 170 C 180 170, 156 116, 116 95" stroke="currentColor" strokeWidth="2.5" />
                    <path className="landing-link-draw" style={{ animationDelay: '720ms' }} d="M212 170 C 176 170, 156 236, 116 252" stroke="currentColor" strokeWidth="2.5" />
                  </svg>

                  <div className="absolute left-[220px] top-[116px] rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-[0_10px_20px_-12px_rgba(5,150,105,0.8)] dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950 landing-node-pop" style={{ animationDelay: '680ms' }}>
                    Product Launch
                    <span className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-emerald-400 bg-white dark:border-emerald-300 dark:bg-emerald-950" />
                    <span className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-emerald-400 bg-white dark:border-emerald-300 dark:bg-emerald-950" />
                  </div>
                  <div className="absolute left-[410px] top-[58px] rounded-xl border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm dark:border-cyan-300 dark:bg-cyan-300 dark:text-cyan-950 landing-node-pop" style={{ animationDelay: '820ms' }}>
                    Messaging
                  </div>
                  <div className="absolute left-[430px] top-[132px] rounded-xl border border-indigo-300 bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-900 shadow-sm dark:border-indigo-300 dark:bg-indigo-300 dark:text-indigo-950 landing-node-pop" style={{ animationDelay: '900ms' }}>
                    Channels
                  </div>
                  <div className="absolute left-[398px] top-[218px] rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950 landing-node-pop" style={{ animationDelay: '980ms' }}>
                    Metrics
                  </div>
                  <div className="absolute left-[64px] top-[58px] rounded-xl border border-teal-300 bg-teal-100 px-3 py-2 text-xs font-semibold text-teal-900 shadow-sm dark:border-teal-300 dark:bg-teal-300 dark:text-teal-950 landing-node-pop" style={{ animationDelay: '1060ms' }}>
                    Research
                  </div>
                  <div className="absolute left-[76px] top-[215px] rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-900 shadow-sm dark:border-rose-300 dark:bg-rose-300 dark:text-rose-950 landing-node-pop" style={{ animationDelay: '1140ms' }}>
                    Risks
                  </div>

                  <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100 landing-fade-up" style={{ animationDelay: '1200ms' }}>
                    <Move className="h-3.5 w-3.5" />
                    Drag canvas
                  </div>

                  <div className="absolute bottom-3 right-3 w-28 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm dark:border-slate-600 dark:bg-slate-900/95 landing-fade-up" style={{ animationDelay: '1260ms' }}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-200">Mini map</p>
                    <div className="relative h-14 rounded border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                      <span className="absolute left-[10px] top-[8px] h-1.5 w-6 rounded bg-slate-300 dark:bg-slate-500" />
                      <span className="absolute left-[18px] top-[22px] h-1.5 w-8 rounded bg-slate-300 dark:bg-slate-500" />
                      <span className="absolute left-[38px] top-[38px] h-1.5 w-5 rounded bg-slate-300 dark:bg-slate-500" />
                      <span className="absolute left-[22px] top-[14px] h-6 w-10 rounded border border-emerald-300 dark:border-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <article
                  key={feature.title}
                  className="group rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-[0_20px_60px_-40px_rgba(2,6,23,0.9)] dark:hover:border-slate-500"
                >
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white dark:bg-slate-800 dark:text-slate-100 dark:group-hover:bg-emerald-400 dark:group-hover:text-emerald-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{feature.description}</p>
                </article>
              )
            })}
          </div>

          <div className="mt-10 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 text-sm leading-6 text-emerald-900 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100">
            <p>
              Public share links stay available without login. If someone opens a shared note URL, they can view it directly from the share page.
            </p>
            <Link
              href="/share"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 sm:mt-0 dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
            >
              Open share page
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
