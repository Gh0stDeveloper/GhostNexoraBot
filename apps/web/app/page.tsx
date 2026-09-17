import { Activity, Bot, BrainCircuit, CheckCircle2, Coins, Download, FileCheck2, Gamepad2, GitBranch, LayoutDashboard, LockKeyhole, LogIn, MessageSquareMore, ServerCog, ShieldCheck, UsersRound } from 'lucide-react'
import { getWebLocale } from '../lib/i18n-server'
import { webT } from '../lib/i18n'
import { downloadT } from '../lib/downloads-i18n'
import { getOfficialReleaseCatalog, type ReleaseKind } from '../lib/releases'

export const dynamic = 'force-dynamic'

const DEVICON_BASE = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons'

type PlatformBrand = {
  src: string
  alt: string
}

const PLATFORM_BRANDS = {
  windows: [{ src: `${DEVICON_BASE}/windows11/windows11-original.svg`, alt: 'Windows' }],
  android: [{ src: `${DEVICON_BASE}/android/android-original.svg`, alt: 'Android' }],
  debian: [
    { src: `${DEVICON_BASE}/ubuntu/ubuntu-original.svg`, alt: 'Ubuntu' },
    { src: `${DEVICON_BASE}/debian/debian-original.svg`, alt: 'Debian' },
  ],
  linux: [{ src: `${DEVICON_BASE}/linux/linux-original.svg`, alt: 'Linux' }],
} as const

function PlatformLogos({ brands }: { brands: readonly PlatformBrand[] }) {
  return <div className="flex items-center -space-x-2" aria-label={brands.map((brand) => brand.alt).join(' / ')}>
    {brands.map((brand) => <span key={brand.alt} className="grid size-12 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-[#111827] shadow-[0_10px_28px_rgba(0,0,0,.3)] first:z-10">
      <img src={brand.src} alt={brand.alt} className="size-7 object-contain" loading="lazy" decoding="async" />
    </span>)}
  </div>
}

export default async function Home() {
  const locale = await getWebLocale()
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const dt = (key: Parameters<typeof downloadT>[1]) => downloadT(locale, key)
  const release = getOfficialReleaseCatalog()
  const has = (kind: ReleaseKind) => release.artifacts.some((artifact) => artifact.kind === kind)

  const publicStages = [
    ['01', t('home.stage.01.name'), t('home.stage.01.text')],
    ['02', t('home.stage.02.name'), t('home.stage.02.text')],
    ['03', t('home.stage.03.name'), t('home.stage.03.text')],
    ['04', t('home.stage.04.name'), t('home.stage.04.text')],
    ['05', t('home.stage.05.name'), t('home.stage.05.text')],
    ['06', t('home.stage.06.name'), t('home.stage.06.text')],
    ['07', t('home.stage.07.name'), t('home.stage.07.text')],
  ]
  const modules = [
    [BrainCircuit, t('home.module.ai'), t('home.module.aiText')],
    [Download, t('home.module.downloads'), t('home.module.downloadsText')],
    [Coins, t('home.module.economy'), t('home.module.economyText')],
    [Gamepad2, t('home.module.arcade'), t('home.module.arcadeText')],
    [ShieldCheck, t('home.module.moderation'), t('home.module.moderationText')],
    [UsersRound, t('home.module.subbots'), t('home.module.subbotsText')],
  ]
  const purposes = [
    [UsersRound, t('home.purpose.adminTitle'), t('home.purpose.adminText')],
    [MessageSquareMore, t('home.purpose.usefulTitle'), t('home.purpose.usefulText')],
    [Bot, t('home.purpose.subbotTitle'), t('home.purpose.subbotText')],
    [Activity, t('home.purpose.auditTitle'), t('home.purpose.auditText')],
  ]
  const profile = [
    [Activity, t('home.profile.pipeline'), t('home.profile.pipelineValue')],
    [ServerCog, t('home.profile.auditor'), t('home.profile.auditorValue')],
    [UsersRound, t('home.profile.communities'), t('home.profile.communitiesValue')],
    [MessageSquareMore, t('home.profile.private'), t('home.profile.privateValue')],
    [BrainCircuit, t('home.profile.llm'), t('home.profile.llmValue')],
    [LockKeyhole, t('home.profile.isolation'), t('home.profile.isolationValue')],
  ]
  const flow = [
    ['1', t('home.flow.1.title'), t('home.flow.1.text')],
    ['2', t('home.flow.2.title'), t('home.flow.2.text')],
    ['3', t('home.flow.3.title'), t('home.flow.3.text')],
    ['4', t('home.flow.4.title'), t('home.flow.4.text')],
    ['5', t('home.flow.5.title'), t('home.flow.5.text')],
  ]
  const downloads = [
    [PLATFORM_BRANDS.windows, dt('platform.windows'), 'NSIS · x64', has('nsis')],
    [PLATFORM_BRANDS.android, dt('platform.android'), 'APK', has('apk')],
    [PLATFORM_BRANDS.debian, dt('platform.debian'), 'DEB · amd64', has('deb')],
    [PLATFORM_BRANDS.linux, dt('platform.appimage'), 'AppImage · x64', has('appimage')],
  ] as const

  return <main className="ops-page">
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080809]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="#inicio" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-5 text-blue-400"/></span><span><span className="block text-sm font-black tracking-wide">GHOST NEXORA BOT</span><span className="block text-[10px] uppercase tracking-[.18em] text-zinc-600">{t('home.brandSubtitle')}</span></span></a>
        <nav className="hidden gap-6 text-xs font-semibold text-zinc-500 lg:flex"><a href="#descargas" className="hover:text-white">{dt('nav')}</a><a href="#funcionamiento" className="hover:text-white">{t('home.nav.operation')}</a><a href="#arquitectura" className="hover:text-white">{t('home.nav.architecture')}</a><a href="#modulos" className="hover:text-white">{t('home.nav.modules')}</a><a href="#seguridad" className="hover:text-white">{t('home.nav.security')}</a></nav>
        <a href="/login" className="ops-button-primary"><LogIn className="size-4"/>{t('common.access')}</a>
      </div>
    </header>

    <section id="inicio" className="relative mx-auto grid min-h-[72vh] w-full max-w-[1480px] items-center gap-12 overflow-hidden px-5 py-16 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
      <div className="pointer-events-none absolute left-[20%] top-12 size-96 rounded-full bg-blue-600/[.05] blur-[120px]"/>
      <div className="relative">
        <p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-blue-500">{t('home.eyebrow')}</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.98] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">{t('home.title.before')}<span className="text-blue-400">{t('home.title.platforms')}</span></h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-500">{t('home.intro')}</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="/downloads" className="ops-button-primary"><Download className="size-4"/>{dt('hero.cta')}</a><a href="#funcionamiento" className="ops-button-muted"><GitBranch className="size-4"/>{t('home.how')}</a><a href="/login?mode=subbot" className="ops-button-muted"><LayoutDashboard className="size-4"/>{t('home.subbotPortal')}</a></div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-zinc-600"><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>{t('home.badge.stack')}</span><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>{t('home.badge.isolation')}</span><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>{t('home.badge.ops')}</span></div>
      </div>

      <div className="ops-panel relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">{t('home.systemProfile')}</p><h2 className="mt-1 font-bold">{t('home.runtime')}</h2></div><span className="ops-badge-good">{t('home.operational')}</span></div>
        <div className="grid grid-cols-2 gap-px bg-white/[.06] sm:grid-cols-3">{profile.map(([Icon,label,value])=>{const I=Icon as typeof Activity;return <div key={String(label)} className="bg-[#101012] p-5"><I className="size-4 text-blue-500"/><p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-700">{String(label)}</p><p className="mt-1 text-sm font-bold text-zinc-200">{String(value)}</p></div>})}</div>
      </div>
    </section>

    <section id="descargas" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-12 md:px-8">
      <div className="overflow-hidden rounded-2xl border border-blue-500/15 bg-[linear-gradient(135deg,rgba(37,99,235,.09),#101012_42%,#101012)] shadow-[0_22px_70px_rgba(0,0,0,.22)]">
        <div className="grid gap-8 border-b border-white/[.07] p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-blue-500">{dt('hero.badge')}</p><h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{dt('hero.title')}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">{dt('hero.text')}</p></div><a href="/downloads" className="ops-button-primary"><Download className="size-4"/>{dt('hero.cta')}</a></div>
        <div className="grid gap-px bg-white/[.06] sm:grid-cols-2 lg:grid-cols-4">{downloads.map(([brands,title,format,available])=><div key={title} className="bg-[#0d0d0f] p-5"><div className="flex items-center justify-between gap-4"><PlatformLogos brands={brands}/><span className={available ? 'ops-badge-good' : 'ops-badge-warn'}>{available ? `v${release.version}` : dt('artifact.unavailable')}</span></div><h3 className="mt-4 font-bold text-zinc-200">{title}</h3><p className="mt-1 font-mono text-[11px] text-zinc-700">{format}</p></div>)}</div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-[11px] text-zinc-600 md:px-8"><span className="flex items-center gap-2"><FileCheck2 className="size-3.5 text-emerald-500"/>{dt('trust.hash')}</span><span className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-blue-500"/>{dt('trust.keys')}</span><span className="flex items-center gap-2"><GitBranch className="size-3.5 text-violet-500"/>{dt('trust.source')}</span></div>
      </div>
    </section>

    <section id="funcionamiento" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <div className="mb-8 max-w-4xl"><p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-blue-500">{t('home.purposeEyebrow')}</p><h2 className="mt-2 text-3xl font-black tracking-tight">{t('home.purposeTitle')}</h2><p className="mt-3 text-sm leading-7 text-zinc-500">{t('home.purposeIntro')}</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{purposes.map(([Icon,title,text])=>{const I=Icon as typeof Bot;return <article key={String(title)} className="ops-stat min-h-56"><I className="size-5 text-blue-500"/><h3 className="mt-5 text-lg font-bold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{String(text)}</p></article>})}</div>
      <div className="ops-panel mt-5 overflow-hidden"><div className="border-b border-white/[.08] px-5 py-4"><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">{t('home.flowEyebrow')}</p><h3 className="mt-1 font-bold">{t('home.flowTitle')}</h3></div><div className="grid gap-px bg-white/[.06] md:grid-cols-5">{flow.map(([id,title,text])=><div key={id} className="bg-[#101012] p-5"><span className="font-mono text-xs font-bold text-blue-500">{id.padStart(2,'0')}</span><h4 className="mt-3 font-bold text-zinc-200">{title}</h4><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>)}</div></div>
    </section>

    <section id="arquitectura" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8"><div className="ops-panel overflow-hidden"><div className="border-b border-white/[.08] px-5 py-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">{t('home.archEyebrow')}</p><h2 className="mt-2 text-xl font-black">{t('home.archTitle')}</h2><p className="mt-2 max-w-3xl text-sm text-zinc-600">{t('home.archText')}</p></div><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">{publicStages.map(([id,name,text])=><article key={id} className="ops-node"><div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-blue-500">{t('home.stageLabel', { id })}</span><span className="ops-badge-good">{t('home.instrumented')}</span></div><h3 className="mt-5 font-bold">{name}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{text}</p></article>)}</div></div></section>

    <section id="modulos" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8"><div className="mb-8"><p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-blue-500">{t('home.modulesEyebrow')}</p><h2 className="mt-2 text-3xl font-black tracking-tight">{t('home.modulesTitle')}</h2></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{modules.map(([Icon,title,text])=>{const I=Icon as typeof Bot;return <article key={String(title)} className="ops-stat min-h-48"><I className="size-5 text-blue-500"/><h3 className="mt-5 text-lg font-bold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{String(text)}</p></article>})}</div></section>

    <section id="seguridad" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8"><div className="grid gap-4 lg:grid-cols-2"><article className="ops-panel p-6"><LockKeyhole className="size-5 text-blue-500"/><h2 className="mt-5 text-xl font-black">{t('home.security.privateTitle')}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{t('home.security.privateText')}</p></article><article className="ops-panel p-6"><LayoutDashboard className="size-5 text-blue-500"/><h2 className="mt-5 text-xl font-black">{t('home.security.opsTitle')}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{t('home.security.opsText')}</p></article></div></section>

    <footer className="mt-12 border-t border-white/[.07]"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 px-5 py-8 text-xs text-zinc-700 md:flex-row md:items-center md:justify-between md:px-8"><span>Ghost Nexora Bot · Ghost Developer / Nexora</span><span>{t('home.footer')}</span></div></footer>
  </main>
}
