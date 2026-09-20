import type { Metadata } from 'next'
import { ArrowLeft, Gauge, Orbit, Palette, Satellite, Sparkles } from 'lucide-react'
import { UnifiedNavigation, type UnifiedNavItem } from '../../components/unified-navigation'
import { NexoraSolarExplorer } from '../../components/solar-system/solar-explorer'
import { getWebLocale } from '../../lib/i18n-server'
import { solarSystemCopy } from '../../lib/solar-system-i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getWebLocale()
  const t = solarSystemCopy[locale]
  return {
    title: t.metaTitle,
    description: t.metaDescription,
  }
}

export default async function SolarSystemPage() {
  const locale = await getWebLocale()
  const t = solarSystemCopy[locale]

  const navigation: UnifiedNavItem[] = [
    { id: 'nexora-home', label: t.nav.nexoraHome, href: '/', icon: 'home', group: t.groups.nexora },
    { id: 'fourth-dimension', label: t.nav.fourthDimension, href: '/cuarta-dimension', icon: 'activity', group: t.groups.projects },
    { id: 'solar-project', label: t.nav.project, href: '/sistema-solar', icon: 'modules', active: true, group: t.groups.projects },
    { id: 'solar-explorer', label: t.nav.explorer, href: '#explorador', icon: 'activity', group: t.groups.project },
    { id: 'solar-realism', label: t.nav.realism, href: '#realismo', icon: 'modules', group: t.groups.project },
    { id: 'solar-data', label: t.nav.data, href: '#datos', icon: 'diagnostics', group: t.groups.project },
    { id: 'solar-controls', label: t.nav.controls, href: '#controles', icon: 'settings', group: t.groups.project },
  ]

  const infoCards = [
    [Palette, t.realismTitle, t.realismText, 'text-amber-300'],
    [Orbit, t.orbitTitle, t.orbitText, 'text-cyan-300'],
    [Sparkles, t.galacticTitle, t.galacticText, 'text-violet-300'],
    [Gauge, t.controlsTitle, t.controlsText, 'text-emerald-300'],
  ] as const

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
      <section id="explorador" className="relative scroll-mt-24 overflow-hidden border-b border-white/[.07]">
        <NexoraSolarExplorer locale={locale}/>
      </section>

      <section className="relative overflow-hidden border-b border-white/[.07]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[8%] top-[-12rem] size-[34rem] rounded-full bg-amber-500/[.08] blur-[130px]"/>
          <div className="absolute right-[4%] top-[20%] size-[30rem] rounded-full bg-blue-500/[.08] blur-[120px]"/>
        </div>
        <div className="mx-auto w-full max-w-[1480px] px-5 py-14 md:px-8 md:py-20">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2">
              <Satellite className="size-4 text-cyan-300"/>
              <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-cyan-300">{t.explorerEyebrow}</p>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-.045em] text-white md:text-6xl">{t.title}</h1>
            <p className="mt-2 text-lg font-bold text-zinc-400">{t.subtitle}</p>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">{t.intro}</p>
            <p className="mt-4 max-w-3xl text-xs leading-6 text-zinc-500">{t.sourceNote}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#explorador" className="ops-button-primary"><Orbit className="size-4"/>{t.openExplorer}</a>
              <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{t.back}</a>
            </div>
          </div>
        </div>
      </section>

      <section id="realismo" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="grid gap-3 md:grid-cols-2">
          {infoCards.slice(0, 2).map(([Icon, title, text, tone]) => <article key={title} className="ops-panel min-h-64 p-6">
            <Icon className={`size-5 ${tone}`}/>
            <h2 className="mt-5 text-xl font-black text-white">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300">{text}</p>
          </article>)}
        </div>
      </section>

      <section id="datos" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-4 md:px-8">
        <article className="ops-panel p-6 md:p-8">
          <Sparkles className="size-5 text-violet-300"/>
          <h2 className="mt-5 text-2xl font-black text-white">{t.galacticTitle}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-zinc-300">{t.galacticText}</p>
        </article>
      </section>

      <section id="controles" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <article className="ops-panel p-6 md:p-8">
          <Gauge className="size-5 text-emerald-300"/>
          <h2 className="mt-5 text-2xl font-black text-white">{t.controlsTitle}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-zinc-300">{t.controlsText}</p>
        </article>
      </section>

      <footer className="border-t border-white/[.07]">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 px-5 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:px-8">
          <span>Ghost Developer · Nexora Projects</span>
          <span>{t.footer}</span>
        </div>
      </footer>
    </div>
  </main>
}
