/**
 * Skeleton shell shown while auth/workspace data loads. Mirrors the real
 * sidebar + document layout so the transition into content doesn't jump.
 */
export default function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-screen bg-background text-foreground" role="status" aria-busy="true">
      <span className="sr-only">Loading your workspace…</span>

      <aside className="hidden w-[300px] shrink-0 border-r border-border bg-surface p-3 md:block" aria-hidden>
        <div className="mb-4 flex items-center gap-2 px-2">
          <div className="h-6 w-6 animate-pulse rounded-md bg-surface-active" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-surface-active" />
        </div>
        <div className="mb-4 h-8 w-full animate-pulse rounded-lg bg-surface-hover" />
        <div className="space-y-3 px-1">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-surface-active" />
              <div
                className="h-3 animate-pulse rounded bg-surface-active"
                style={{ width: `${52 + ((index * 17) % 38)}%` }}
              />
            </div>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-3 sm:p-5" aria-hidden>
        <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
          <div className="h-7 w-2/3 animate-pulse rounded bg-surface-active" />
          <div className="space-y-2.5 pt-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="h-3.5 animate-pulse rounded bg-surface-hover"
                style={{ width: `${68 + ((index * 11) % 30)}%` }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
