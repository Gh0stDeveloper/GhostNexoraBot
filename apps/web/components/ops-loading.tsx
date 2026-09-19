import { Bot } from 'lucide-react'

export function OpsLoading() {
  return <main className="ops-shell">
    <div className="ops-shell-content">
      <div className="ops-page-frame">
        <header className="ops-page-header">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-blue-500/15 bg-blue-500/[.06]"><Bot className="size-5 text-blue-400"/></span>
            <div className="w-full max-w-sm space-y-2">
              <div className="ops-skeleton-line w-28"/>
              <div className="ops-skeleton-line h-6 w-48"/>
              <div className="ops-skeleton-line w-64"/>
            </div>
          </div>
        </header>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => <article key={index} className="ops-skeleton h-28"/>)}
        </section>
        <section className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <article className="ops-skeleton h-80"/>
          <article className="ops-skeleton h-80"/>
        </section>
        <section className="mt-4 ops-skeleton h-72"/>
      </div>
    </div>
  </main>
}
