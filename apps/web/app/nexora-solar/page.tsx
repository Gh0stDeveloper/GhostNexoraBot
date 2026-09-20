import type { Metadata } from 'next'
import { ArrowLeft, Orbit, Route, Sparkles, Sun, Telescope } from 'lucide-react'
import { UnifiedNavigation, type UnifiedNavItem } from '../../components/unified-navigation'
import { NexoraSolarExplorer } from '../../components/nexora-solar-explorer'
import { getWebLocale } from '../../lib/i18n-server'
import { nexoraSolarCopy } from '../../lib/nexora-solar-i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getWebLocale()
  const t = nexoraSolarCopy[locale]
  return { title: t.metaTitle, description: t.metaDescription }
}

export default async function NexoraSolarPage() {
  const locale = await getWebLocale()
  const t = nexoraSolarCopy[locale]
  const navigation: UnifiedNavItem[] = [
    { id: 'nexora-home', label: t.nav.nexoraHome, href: '/', icon: 'home', group: t.groups.nexora },
    { id: 'fourth-dimension', label: t.nav.fourthDimension, href: '/cuarta-dimension', icon: 'activity', group: t.groups.projects },
    { id: 'solar-current', label: t.nav.solar, href: '/nexora-solar', icon: 'activity', active: true, group: t.groups.projects },
    { id: 'solar-overview', label: t.nav.overview, href: '#inicio', icon: 'home', group: t.groups.project },
    { id: 'solar-explorer', label: t.nav.explorer, href: '#explorador', icon: 'activity', group: t.groups.project },
    { id: 'solar-realism', label: t.nav.realism, href: '#realismo', icon: 'modules', group: t.groups.project },
    { id: 'solar-galactic', label: t.nav.galactic, href: '#movimiento-galactico', icon: 'flow', group: t.groups.project },
  ]

  const realismIcons = [Sun, Telescope, Orbit]
  const galacticIcons = [Route, Sparkles, Orbit]

  return <main className="ops-shell">
    <UnifiedNavigation
      items={navigation}
      brandTitle="NEXORA PROJECTS"
      brandSubtitle={t.brand}
      brandHref="/"
      actionHref="/"
      actionLabel={t.back}
      ariaLabel={t.brand}
      closeLabel={locale === 'en' ? 'Close navigation' : 'Cerrar navegación'}
    />

    <div className="ops-shell-content">
      <section id="inicio" className="relative isolate overflow-hidden border-b border-white/[.07]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[7%] top-[-12rem] size-[42rem] rounded-full bg-blue-600/[.12] blur-[150px]"/>
          <div className="absolute right-[5%] top-[16%] size-[34rem] rounded-full bg-amber-500/[.08] blur-[140px]"/>
          <div className="absolute bottom-[-18rem] left-[42%] size-[36rem] rounded-full bg-cyan-500/[.055] blur-[150px]"/>
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.22)_0_1px,transparent_1.5px)] [background-size:38px_38px]"/>
        </div>
        <div className="mx-auto grid min-h-[72vh] w-full max-w-[1480px] items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-[1fr_.82fr] lg:py-24">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[.2em] text-blue-300">{t.eyebrow}</p>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[.96] tracking-[-.055em] text-white sm:text-6xl lg:text-7xl">
              {t.titleBefore}<span className="bg-gradient-to-r from-amber-200 via-blue-300 to-cyan-300 bg-clip-text text-transparent">{t.titleAccent}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-300 md:text-lg">{t.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#explorador" className="ops-button-primary"><Orbit className="size-4"/>{t.explore}</a>
              <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{t.back}</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {t.badges.map((label) => <span key={label} className="rounded-md border border-white/[.08] bg-white/[.035] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-300">{label}</span>)}
            </div>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <div className="absolute inset-[4%] rounded-full border border-blue-300/15"/>
            <div className="absolute inset-[17%] rounded-full border border-cyan-300/15"/>
            <div className="absolute inset-[31%] rounded-full border border-amber-300/20"/>
            <div className="absolute inset-[40%] rounded-full bg-[radial-gradient(circle_at_35%_35%,#fffbd0_0%,#ffd35f_30%,#ff8b2d_62%,#8b280d_100%)] shadow-[0_0_100px_rgba(255,164,61,.34)]"/>
            <span className="absolute left-[9%] top-[32%] size-5 rounded-full bg-[#3d78e3] shadow-[0_0_26px_rgba(77,139,255,.55)]"/>
            <span className="absolute right-[6%] top-[44%] size-8 rounded-full bg-[#d09d6e] shadow-[0_0_28px_rgba(223,169,113,.38)]"/>
            <span className="absolute bottom-[15%] left-[24%] size-6 rounded-full bg-[#5ec5ce] shadow-[0_0_24px_rgba(94,197,206,.4)]"/>
          </div>
        </div>
      </section>

      <section id="explorador" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-3 py-10 sm:px-5 md:px-8 md:py-16">
        <NexoraSolarExplorer locale={locale}/>
      </section>

      <section id="realismo" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-cyan-300">{t.realismEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.realismTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.realismIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {t.realismCards.map(([title, text], index) => {
            const Icon = realismIcons[index]
            return <article key={title} className="ops-stat min-h-56"><Icon className="size-5 text-cyan-300"/><h3 className="mt-5 text-lg font-black text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p></article>
          })}
        </div>
      </section>

      <section id="movimiento-galactico" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-amber-300">{t.galacticEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.galacticTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.galacticIntro}</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {t.galacticCards.map(([title, text], index) => {
            const Icon = galacticIcons[index]
            return <article key={title} className="ops-panel p-6"><Icon className="size-5 text-amber-300"/><h3 className="mt-5 text-lg font-black text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p></article>
          })}
        </div>
      </section>

      <footer className="mt-8 border-t border-white/[.07]">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 px-5 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:px-8">
          <span>{t.footer}</span><span>{t.source}</span>
        </div>
      </footer>
    </div>
  </main>
}
