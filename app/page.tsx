'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  ArrowRight,
  Bot,
  FileText,
  FolderTree,
  GitBranch,
  LayoutDashboard,
  PenSquare,
  Share2,
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

const workflow = [
  {
    title: 'Capture',
    detail: 'Quickly capture ideas with templates designed for planning, research, and personal reflection.',
    icon: FileText,
  },
  {
    title: 'Connect',
    detail: 'Link notes, map dependencies, and build project views that surface what matters right now.',
    icon: GitBranch,
  },
  {
    title: 'Ship',
    detail: 'Share selected notes with secure links while your main workspace remains protected behind login.',
    icon: Share2,
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
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How people use it</p>
              <div className="mt-5 space-y-4">
                {workflow.map((step) => {
                  const Icon = step.icon

                  return (
                    <article key={step.title} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </span>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-800">{step.title}</h2>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{step.detail}</p>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">What you can do inside the app</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            From quick idea capture to detailed project planning, each feature is built to stay fast in desktop and web views.
          </p>

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
