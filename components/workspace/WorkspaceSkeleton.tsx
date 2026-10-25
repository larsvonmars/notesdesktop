import ShellBackground from '@/components/shell/ShellBackground'

const LIBRARY_ROW_WIDTHS = [62, 78, 48, 86, 56, 72, 44, 68]
const NOTE_ROW_WIDTHS = [74, 88, 58, 80, 66, 92, 52, 76]
const DOC_LINE_WIDTHS = [96, 88, 92, 74, 90, 63]

/**
 * Shell skeleton shown while auth/workspace data loads. Mirrors the real
 * rail + library + top bar + note list + editor geometry so content doesn't
 * jump when it arrives.
 */
export default function WorkspaceSkeleton() {
  return (
    <div
      className="relative flex h-screen w-full flex-col overflow-hidden text-foreground"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading your workspace…</span>
      <ShellBackground />

      <div className="relative flex h-full min-h-0 w-full">
        {/* Rail */}
        <div
          aria-hidden="true"
          className="glass-subtle hidden h-full w-[var(--rail-width,68px)] shrink-0 flex-col items-center border-y-0 border-l-0 py-3 md:flex"
        >
          <div className="skeleton-shimmer h-10 w-10 rounded-2xl" />
          <div className="mt-6 flex flex-col items-center gap-2.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="skeleton-shimmer h-10 w-10 rounded-[14px]"
                style={{ opacity: index === 1 ? 1 : 0.6 }}
              />
            ))}
          </div>
          <div className="min-h-8 flex-1" />
          <div className="flex flex-col items-center gap-2.5 pb-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton-shimmer h-9 w-9 rounded-full opacity-60" />
            ))}
          </div>
        </div>

        {/* Library */}
        <aside
          aria-hidden="true"
          className="glass-subtle hidden h-full w-[var(--library-width,300px)] shrink-0 flex-col border-y-0 border-l-0 p-3 lg:flex"
        >
          <div className="flex items-center gap-2 px-1">
            <div className="skeleton-shimmer h-6 w-6 rounded-md" />
            <div className="skeleton-shimmer h-3.5 w-24 rounded-full" />
            <div className="skeleton-shimmer ml-auto h-6 w-6 rounded-lg" />
          </div>
          <div className="skeleton-shimmer mt-3 h-8 w-full rounded-lg" />
          <div className="mt-4 space-y-3 px-1">
            {LIBRARY_ROW_WIDTHS.map((width, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded" />
                <div
                  className="skeleton-shimmer h-3 rounded-full"
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <div
            aria-hidden="true"
            className="glass flex h-[52px] shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-3 md:h-[var(--topbar-height,56px)]"
          >
            <div className="skeleton-shimmer h-3.5 w-16 rounded-full sm:w-28" />
            <div className="skeleton-shimmer h-3 w-10 rounded-full sm:w-16" />
            <div className="skeleton-shimmer ml-auto h-8 w-9 rounded-full md:w-52" />
            <div className="skeleton-shimmer h-8 w-9 rounded-full" />
            <div className="skeleton-shimmer h-8 w-9 rounded-full" />
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Note list */}
            <div
              aria-hidden="true"
              className="hidden w-[var(--list-width,328px)] shrink-0 flex-col border-r border-border p-3 md:flex"
            >
              <div className="flex items-center gap-2">
                <div className="skeleton-shimmer h-4 w-24 rounded-full" />
                <div className="skeleton-shimmer h-4 w-6 rounded-full" />
                <div className="skeleton-shimmer ml-auto h-7 w-7 rounded-full" />
              </div>
              <div className="mt-5 flex items-center justify-between px-1">
                <div className="skeleton-shimmer h-2.5 w-14 rounded-full" />
                <div className="skeleton-shimmer h-2.5 w-4 rounded-full" />
              </div>
              <div className="mt-3 space-y-2">
                {NOTE_ROW_WIDTHS.map((width, index) => (
                  <div key={index} className="flex items-center gap-2.5 px-1 py-1.5">
                    <div className="skeleton-shimmer h-8 w-8 shrink-0 rounded-[9px]" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div
                        className="skeleton-shimmer h-2.5 rounded-full"
                        style={{ width: `${width}%` }}
                      />
                      <div className="skeleton-shimmer h-2 w-1/3 rounded-full opacity-70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Editor card */}
            <main aria-hidden="true" className="min-w-0 flex-1 overflow-hidden p-2 sm:p-3">
              <div className="glass-card flex h-full flex-col rounded-3xl p-5 sm:p-8">
                <div className="flex items-center gap-2">
                  <div className="skeleton-shimmer h-6 w-20 rounded-full" />
                  <div className="skeleton-shimmer ml-auto h-7 w-7 rounded-lg" />
                  <div className="skeleton-shimmer h-7 w-7 rounded-lg" />
                </div>
                <div className="skeleton-shimmer mt-6 h-8 w-3/4 rounded-full sm:h-9" />
                <div className="skeleton-shimmer mt-2.5 h-8 w-1/2 rounded-full opacity-70" />
                <div className="mt-8 space-y-3">
                  {DOC_LINE_WIDTHS.map((width, index) => (
                    <div
                      key={index}
                      className="skeleton-shimmer h-3 rounded-full opacity-80"
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-8">
                  <div className="skeleton-shimmer h-8 w-24 rounded-full" />
                  <div className="skeleton-shimmer h-8 w-20 rounded-full opacity-60" />
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div
        aria-hidden="true"
        className="glass fixed inset-x-0 bottom-0 z-40 flex min-h-[var(--mobile-bar-height,60px)] items-center justify-around rounded-none border-x-0 border-b-0 px-4 pb-[var(--sab)] md:hidden"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-1.5">
            <div
              className="skeleton-shimmer h-7 w-12 rounded-full"
              style={{ opacity: index === 0 ? 1 : 0.55 }}
            />
            <div className="skeleton-shimmer h-2 w-8 rounded-full opacity-60" />
          </div>
        ))}
      </div>
    </div>
  )
}
