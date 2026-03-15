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
  Network,
  PenSquare,
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#dbfce7_0%,#f8fafc_38%,#eef2ff_100%)]">
        <ThemeToggle />
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
          <div className="rounded-full border border-white/80 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 shadow-lg backdrop-blur">
            Opening your workspace...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_20%_0%,#dcfce7_0%,#f8fafc_38%,#dbeafe_100%)] text-slate-900">
      <ThemeToggle />

      <section className="relative isolate px-6 pb-16 pt-24 sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-24 top-8 h-56 w-56 rounded-full bg-emerald-300/35 blur-3xl" />
          <div className="absolute right-0 top-20 h-64 w-64 rounded-full bg-sky-300/35 blur-3xl" />
          <div className="absolute bottom-4 left-1/3 h-48 w-48 rounded-full bg-amber-200/35 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="MindViz Notes" className="h-10 w-10" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">MindViz Notes</p>
                <p className="text-sm text-slate-500">Desktop knowledge workspace</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-full border border-slate-300/80 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur transition hover:border-slate-400 hover:bg-white"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                <Sparkles className="h-4 w-4" />
                Everything for serious note-taking
              </p>
              <h1 className="text-balance text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Build your second brain with notes, structure, and visual thinking.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                MindViz Notes combines writing, diagrams, planning tools, and AI assistance in a single workspace designed for deep work.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700"
                >
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Open dashboard
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_40px_120px_-50px_rgba(15,23,42,0.5)] backdrop-blur sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live feature preview</p>
              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <FileText className="h-4 w-4" />
                  Text Note Demo
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="text-base font-semibold text-slate-900">Sprint Planning - Week 12</h2>
                  <p className="mt-2 text-sm text-slate-600">Objectives</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
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
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Feature demos you can explore after signup</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            The workspace is built for writing and visual thinking together. Here is a realistic preview of text notes and the mindmap editor.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                <FileText className="h-4 w-4" />
                Text Notes Editor
              </div>
              <h3 className="text-lg font-semibold text-slate-950">Write structured notes quickly</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Rich formatting, checklists, linked references, and project tags let you move from rough ideas to clean plans.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs text-slate-500">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">H1</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">Bold</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">Checklist</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">Link Note</span>
                </div>
                <h4 className="mt-4 text-sm font-semibold text-slate-900">Launch Retrospective</h4>
                <p className="mt-2 text-sm text-slate-700">
                  This sprint showed stronger handoff quality after linking requirements and design notes directly inside the editor.
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border border-emerald-500 bg-emerald-500/10" />
                    Keep shared checklists for QA and release owners
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border border-slate-300 bg-white" />
                    Add one-click links to architecture notes
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.55)] backdrop-blur">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                <Network className="h-4 w-4" />
                Mindmap Editor Demo
              </div>
              <h3 className="text-lg font-semibold text-slate-950">Map strategy visually with draggable branches</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Expand ideas, create child nodes, and see relationships instantly. This is ideal for planning sessions and research breakdowns.
              </p>

              <div className="relative mt-5 h-[340px] rounded-2xl border border-slate-200 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:24px_24px] p-4">
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 340" fill="none" aria-hidden>
                  <path d="M292 170 C 330 170, 350 110, 395 95" stroke="#94a3b8" strokeWidth="2.5" />
                  <path d="M292 170 C 340 170, 356 170, 412 170" stroke="#94a3b8" strokeWidth="2.5" />
                  <path d="M292 170 C 330 175, 350 240, 395 255" stroke="#94a3b8" strokeWidth="2.5" />
                  <path d="M212 170 C 180 170, 156 116, 116 95" stroke="#94a3b8" strokeWidth="2.5" />
                  <path d="M212 170 C 176 170, 156 236, 116 252" stroke="#94a3b8" strokeWidth="2.5" />
                </svg>

                <div className="absolute left-[220px] top-[140px] rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900 shadow">
                  Product Launch
                </div>
                <div className="absolute left-[410px] top-[78px] rounded-xl border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm">
                  Messaging
                </div>
                <div className="absolute left-[430px] top-[152px] rounded-xl border border-indigo-300 bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-900 shadow-sm">
                  Channels
                </div>
                <div className="absolute left-[398px] top-[238px] rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm">
                  Metrics
                </div>
                <div className="absolute left-[64px] top-[78px] rounded-xl border border-teal-300 bg-teal-100 px-3 py-2 text-xs font-semibold text-teal-900 shadow-sm">
                  Research
                </div>
                <div className="absolute left-[76px] top-[235px] rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-900 shadow-sm">
                  Risks
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
                  className="group rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-300"
                >
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </article>
              )
            })}
          </div>

          <div className="mt-10 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 text-sm leading-6 text-emerald-900 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
            <p>
              Public share links stay available without login. If someone opens a shared note URL, they can view it directly from the share page.
            </p>
            <Link
              href="/share"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 sm:mt-0"
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
