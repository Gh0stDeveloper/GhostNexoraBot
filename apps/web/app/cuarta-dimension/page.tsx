import type { Metadata } from 'next'
import {
  ArrowLeft,
  Atom,
  BookOpen,
  Box,
  Calculator,
  Clock3,
  GalleryVerticalEnd,
  Layers3,
  Orbit,
  Ruler,
  Sparkles,
} from 'lucide-react'
import { UnifiedNavigation, type UnifiedNavItem } from '../../components/unified-navigation'
import { FourthDimensionExplorer } from '../../components/fourth-dimension-explorer'
import { FourthDimensionLabSuite } from '../../components/fourth-dimension-labs'
import { getWebLocale } from '../../lib/i18n-server'
import { fourthDimensionPageCopy } from '../../lib/fourth-dimension-i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getWebLocale()
  const t = fourthDimensionPageCopy[locale]
  return {
    title: t.metaTitle,
    description: t.metaDescription,
  }
}

export default async function FourthDimensionPage() {
  const locale = await getWebLocale()
  const t = fourthDimensionPageCopy[locale]
  const navigation: UnifiedNavItem[] = [
    { id: 'nexora-home', label: t.nav.nexoraHome, href: '/', icon: 'home', group: t.groups.nexora },
    { id: 'project-current', label: t.nav.project, href: '/cuarta-dimension', icon: 'activity', active: true, group: t.groups.projects },
    { id: 'project-solar', label: 'Nexora Solar 3D', href: '/nexora-solar', icon: 'activity', group: t.groups.projects },
    { id: 'home', label: t.nav.overview, href: '#inicio', icon: 'home', group: t.groups.project },
    { id: 'concept', label: t.nav.concept, href: '#concepto', icon: 'modules', group: t.groups.project },
    { id: 'mathematics', label: t.nav.mathematics, href: '#matematica', icon: 'diagnostics', group: t.groups.project },
    { id: 'explorer', label: t.nav.explorer, href: '#explorador', icon: 'activity', group: t.groups.project },
    { id: 'journey', label: t.nav.journey, href: '#viaje', icon: 'flow', group: t.groups.project },
    { id: 'physics', label: t.nav.physics, href: '#fisica', icon: 'diagnostics', group: t.groups.project },
    { id: 'culture', label: t.nav.culture, href: '#cultura', icon: 'logs', group: t.groups.project },
    { id: 'gallery', label: t.nav.gallery, href: '#galeria-4d', icon: 'activity', group: t.groups.project },
    { id: 'slices', label: t.nav.slices, href: '#cortes-4d', icon: 'flow', group: t.groups.project },
    { id: 'laboratory', label: t.nav.laboratory, href: '#laboratorio-4d', icon: 'commands', group: t.groups.project },
    { id: 'relativity', label: t.nav.relativity, href: '#relatividad', icon: 'diagnostics', group: t.groups.project },
    { id: 'art', label: t.nav.art, href: '#arte-4d', icon: 'modules', group: t.groups.project },
    { id: 'quest', label: t.nav.quest, href: '#juego-puzzles', icon: 'activity', group: t.groups.project },
    { id: 'museum', label: t.nav.museum, href: '#museo-4d', icon: 'logs', group: t.groups.project },
  ]

  const conceptIcons = [BookOpen, Layers3, Sparkles]
  const mathIcons = [Box, Orbit, Calculator]
  const physicsIcons = [Clock3, Atom, GalleryVerticalEnd]
  const cultureIcons = [BookOpen, Sparkles, GalleryVerticalEnd]

  return <main className="ops-shell">
    <UnifiedNavigation
      items={navigation}
      brandTitle="NEXORA PROJECTS"
      brandSubtitle={t.brand}
      brandHref="/"
      actionHref="/"
      actionLabel={t.back}
      ariaLabel={t.navAria}
      closeLabel={t.close}
    />

    <div className="ops-shell-content">
      <section id="inicio" className="relative isolate overflow-hidden border-b border-white/[.07]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[8%] top-[-10rem] size-[38rem] rounded-full bg-violet-600/[.14] blur-[140px]"/>
          <div className="absolute right-[2%] top-[18%] size-[32rem] rounded-full bg-blue-500/[.09] blur-[130px]"/>
          <div className="absolute bottom-[-16rem] left-[45%] size-[34rem] rounded-full bg-cyan-500/[.05] blur-[140px]"/>
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px]"/>
        </div>

        <div className="mx-auto grid min-h-[78vh] w-full max-w-[1480px] items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-[1fr_.88fr] lg:py-24">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[.2em] text-violet-300">{t.eyebrow}</p>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[.96] tracking-[-.055em] text-white sm:text-6xl lg:text-7xl">
              {t.titleBefore}<span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">{t.titleAccent}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-300 md:text-lg">{t.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#explorador" className="ops-button-primary"><Orbit className="size-4"/>{t.explore}</a>
              <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{t.back}</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {[t.migrated, t.interactive, t.responsive, t.expanded].map((label) =>
                <span key={label} className="rounded-md border border-white/[.08] bg-white/[.035] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-300">{label}</span>
              )}
            </div>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[540px]">
            <div className="absolute inset-[4%] rounded-full border border-violet-400/20"/>
            <div className="absolute inset-[15%] rotate-12 rounded-[30%] border border-blue-400/20"/>
            <div className="absolute inset-[27%] -rotate-12 rounded-[28%] border border-cyan-300/20"/>
            <div className="absolute inset-[39%] grid place-items-center rounded-3xl border border-violet-300/30 bg-violet-500/[.12] shadow-[0_0_90px_rgba(139,92,246,.18)]">
              <Box className="size-16 text-violet-200"/>
            </div>
            <span className="absolute left-[8%] top-[24%] grid size-12 place-items-center rounded-2xl border border-white/[.08] bg-[#111113]/90"><Ruler className="size-5 text-blue-300"/></span>
            <span className="absolute bottom-[10%] right-[10%] grid size-12 place-items-center rounded-2xl border border-white/[.08] bg-[#111113]/90"><Layers3 className="size-5 text-cyan-300"/></span>
            <span className="absolute right-[3%] top-[14%] grid size-12 place-items-center rounded-2xl border border-white/[.08] bg-[#111113]/90"><Sparkles className="size-5 text-violet-300"/></span>
            <span className="absolute bottom-[18%] left-[8%] grid size-12 place-items-center rounded-2xl border border-white/[.08] bg-[#111113]/90"><Calculator className="size-5 text-emerald-300"/></span>
          </div>
        </div>
      </section>

      <section id="concepto" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-blue-400">{t.conceptEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.conceptTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.conceptIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {t.conceptCards.map(([title, text], index) => {
            const Icon = conceptIcons[index]
            return <article key={title} className="ops-stat min-h-64">
              <Icon className="size-5 text-blue-400"/>
              <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
            </article>
          })}
        </div>
      </section>

      <section id="matematica" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-cyan-300">{t.mathEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.mathTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.mathIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {t.mathCards.map(([title, text], index) => {
            const Icon = mathIcons[index]
            return <article key={title} className="ops-panel p-6">
              <Icon className="size-5 text-cyan-300"/>
              <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
            </article>
          })}
        </div>
      </section>

      <section id="explorador" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="mb-7 max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-violet-300">{t.explorerEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.explorerTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.explorerIntro}</p>
        </div>
        <FourthDimensionExplorer locale={locale}/>
      </section>

      <section id="viaje" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="mb-7 max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-cyan-300">{t.journeyEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.journeyTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.journeyIntro}</p>
        </div>
        <FourthDimensionExplorer locale={locale} mode="journey"/>
      </section>

      <section id="fisica" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-emerald-300">{t.physicsEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.physicsTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.physicsIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {t.physicsCards.map(([title, text], index) => {
            const Icon = physicsIcons[index]
            return <article key={title} className="ops-panel p-6">
              <Icon className="size-5 text-emerald-300"/>
              <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
            </article>
          })}
        </div>
      </section>

      <section id="cultura" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-fuchsia-300">{t.cultureEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.cultureTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.cultureIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {t.cultureCards.map(([title, text], index) => {
            const Icon = cultureIcons[index]
            return <article key={title} className="ops-stat min-h-60">
              <Icon className="size-5 text-fuchsia-300"/>
              <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
            </article>
          })}
        </div>
      </section>

      <FourthDimensionLabSuite locale={locale}/>

      <footer className="mt-8 border-t border-white/[.07]">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 px-5 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:px-8">
          <span>Ghost Developer · Nexora Projects</span>
          <span>{t.footer}</span>
        </div>
      </footer>
    </div>
  </main>
}
