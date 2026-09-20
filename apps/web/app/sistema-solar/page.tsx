import type { Metadata } from 'next'
import { Gauge, Globe2, Orbit, Sparkles } from 'lucide-react'
import { UnifiedNavigation, type UnifiedNavItem } from '../../components/unified-navigation'
import { NexoraHeliosExperience } from '../../components/nexora-helios'
import { getWebLocale } from '../../lib/i18n-server'
import { nexoraHeliosCopy } from '../../lib/nexora-helios-i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getWebLocale()
  const t = nexoraHeliosCopy[locale]
  return {
    title: t.metaTitle,
    description: t.metaDescription,
  }
}

export default async function SolarSystemPage() {
  const locale = await getWebLocale()
  const t = nexoraHeliosCopy[locale]

  const navigation: UnifiedNavItem[] = [
    { id: 'nexora-home', label: t.nav.nexoraHome, href: '/', icon: 'home', group: t.groups.nexora },
    { id: 'fourth-dimension', label: t.nav.fourthDimension, href: '/cuarta-dimension', icon: 'activity', group: t.groups.projects },
    { id: 'helios-current', label: t.nav.project, href: '/sistema-solar', icon: 'activity', active: true, group: t.groups.projects },
    { id: 'observatory', label: t.nav.observatory, href: '#observatorio', icon: 'activity', group: t.groups.project },
    { id: 'movement', label: t.nav.movement, href: '#movimiento-galactico', icon: 'flow', group: t.groups.project },
    { id: 'data', label: t.nav.data, href: '#datos-sistema', icon: 'diagnostics', group: t.groups.project },
  ]

  const movementCards = [
    [Orbit, t.movement.card1Title, t.movement.card1Text],
    [Sparkles, t.movement.card2Title, t.movement.card2Text],
    [Gauge, t.movement.card3Title, t.movement.card3Text],
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
      <section id="observatorio" className="scroll-mt-16 border-b border-white/[.07] pt-16 lg:pt-0">
        <NexoraHeliosExperience locale={locale}/>
      </section>

      <section id="movimiento-galactico" className="relative mx-auto w-full max-w-[1480px] scroll-mt-24 overflow-hidden px-5 py-16 md:px-8 lg:py-20">
        <div className="pointer-events-none absolute left-[20%] top-8 size-80 rounded-full bg-blue-500/[.05] blur-[110px]"/>
        <div className="relative max-w-4xl">
          <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-cyan-300">{t.movement.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.movement.title}</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.movement.intro}</p>
        </div>
        <div className="relative mt-8 grid gap-3 md:grid-cols-3">
          {movementCards.map(([Icon, title, text]) => <article key={title} className="ops-panel p-6">
            <Icon className="size-5 text-cyan-300"/>
            <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
          </article>)}
        </div>
      </section>

      <section id="datos-sistema" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_.9fr] lg:items-end">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2">
              <Globe2 className="size-4 text-orange-300"/>
              <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-orange-300">{t.data.eyebrow}</p>
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{t.data.title}</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{t.data.intro}</p>
            <p className="mt-5 text-xs leading-5 text-zinc-500">{t.sourceNote}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {t.data.cards.map(([value, label]) => <div key={label} className="ops-stat">
              <p className="font-mono text-3xl font-black tracking-tight text-white">{value}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">{label}</p>
            </div>)}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {[t.realisticColor, t.kepler, t.galactic, t.interactive].map((label) =>
            <span key={label} className="rounded-full border border-white/[.08] bg-white/[.025] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-zinc-400">{label}</span>
          )}
        </div>
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
