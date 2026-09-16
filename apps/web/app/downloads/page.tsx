import { ArrowLeft, CheckCircle2, Download, FileCheck2, Fingerprint, ServerCog, ShieldCheck, TerminalSquare } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'
import { downloadT } from '../../lib/downloads-i18n'
import { getOfficialReleaseCatalog, type OfficialReleaseArtifact, type ReleaseKind } from '../../lib/releases'

export const dynamic = 'force-dynamic'

const DEVICON_BASE = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons'

type PlatformBrand = {
  src: string
  alt: string
}

type PlatformCardData = {
  title: string
  text: string
  artifact?: OfficialReleaseArtifact
  brands: readonly PlatformBrand[]
  packageLabel: string
}

const PLATFORM_BRANDS = {
  windows: [{ src: `${DEVICON_BASE}/windows11/windows11-original.svg`, alt: 'Windows' }],
  android: [{ src: `${DEVICON_BASE}/android/android-original.svg`, alt: 'Android' }],
  debian: [
    { src: `${DEVICON_BASE}/ubuntu/ubuntu-original.svg`, alt: 'Ubuntu' },
    { src: `${DEVICON_BASE}/debian/debian-original.svg`, alt: 'Debian' },
  ],
  rpm: [
    { src: `${DEVICON_BASE}/fedora/fedora-original.svg`, alt: 'Fedora' },
    { src: `${DEVICON_BASE}/redhat/redhat-original.svg`, alt: 'Red Hat' },
  ],
  linux: [{ src: `${DEVICON_BASE}/linux/linux-original.svg`, alt: 'Linux' }],
} as const

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function signatureLabel(artifact: OfficialReleaseArtifact, t: (key: Parameters<typeof downloadT>[1]) => string) {
  if (artifact.signatureStatus === 'self-signed') return t('artifact.selfSigned')
  if (artifact.signed) return t('artifact.verified')
  return t('artifact.unsigned')
}

function artifactFor(artifacts: OfficialReleaseArtifact[], kind: ReleaseKind) {
  return artifacts.find((artifact) => artifact.kind === kind)
}

function shortHash(hash: string) {
  if (hash.length <= 32) return hash
  return `${hash.slice(0, 18)}…${hash.slice(-12)}`
}

function PlatformLogos({ brands }: { brands: readonly PlatformBrand[] }) {
  return <div className="flex items-center -space-x-2" aria-label={brands.map((brand) => brand.alt).join(' / ')}>
    {brands.map((brand) => <span key={brand.alt} className="grid size-12 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-[#111827] shadow-[0_10px_28px_rgba(0,0,0,.3)] first:z-10">
      <img src={brand.src} alt={brand.alt} className="size-7 object-contain" loading="lazy" decoding="async" />
    </span>)}
  </div>
}

function PlatformCard({ title, text, artifact, brands, packageLabel, t }: PlatformCardData & {
  t: (key: Parameters<typeof downloadT>[1]) => string
}) {
  return <article className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-[#101012] p-5 shadow-[0_18px_55px_rgba(0,0,0,.22)] transition hover:-translate-y-0.5 hover:border-blue-500/25">
    <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-blue-500/[.055] blur-3xl"/>

    <div className="relative flex items-start justify-between gap-4">
      <PlatformLogos brands={brands}/>
      {artifact ? <span className="ops-badge-good"><CheckCircle2 className="mr-1 size-3"/>{artifact.arch}</span> : <span className="ops-badge-warn">{t('artifact.unavailable')}</span>}
    </div>

    <div className="relative mt-5 flex flex-wrap items-center gap-2">
      <h3 className="text-lg font-black tracking-tight text-white">{title}</h3>
      <span className="rounded-md border border-white/[.07] bg-white/[.025] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-zinc-600">{packageLabel}</span>
    </div>
    <p className="relative mt-2 min-h-16 text-sm leading-6 text-zinc-500">{text}</p>

    {artifact ? <>
      <div className="relative mt-5 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-white/[.06] bg-black/20 p-3">
          <span className="block uppercase tracking-wider text-zinc-700">{t('artifact.size')}</span>
          <strong className="mt-1 block text-zinc-300">{formatBytes(artifact.sizeBytes)}</strong>
        </div>
        <div className="rounded-lg border border-white/[.06] bg-black/20 p-3">
          <span className="block uppercase tracking-wider text-zinc-700">{t('artifact.arch')}</span>
          <strong className="mt-1 block font-mono text-zinc-300">{artifact.arch}</strong>
        </div>
        <div className="col-span-2 rounded-lg border border-white/[.06] bg-black/20 p-3">
          <span className="block uppercase tracking-wider text-zinc-700">{t('artifact.signed')}</span>
          <strong className="mt-1 flex items-center gap-2 text-zinc-300"><ShieldCheck className="size-3.5 text-emerald-500"/>{signatureLabel(artifact, t)}</strong>
        </div>
      </div>

      <div className="relative mt-3 rounded-lg border border-white/[.06] bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-700">{t('artifact.hash')}</span>
          <FileCheck2 className="size-3.5 text-zinc-700"/>
        </div>
        <code className="mt-1 block break-all font-mono text-[11px] text-zinc-500" title={artifact.sha256}>{shortHash(artifact.sha256)}</code>
      </div>

      <a className="ops-button-primary relative mt-4 min-h-14 w-full justify-start px-4" href={`/api/releases/download?id=${encodeURIComponent(artifact.id)}`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10"><Download className="size-4"/></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-bold">{t('artifact.download')} · {title}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] font-normal opacity-70">{artifact.filename}</span>
        </span>
      </a>
    </> : <div className="relative mt-5 rounded-lg border border-white/[.06] bg-black/20 px-4 py-3 text-xs text-zinc-600">{t('release.noneText')}</div>}
  </article>
}

export default async function DownloadsPage() {
  const locale = await getWebLocale()
  const t = (key: Parameters<typeof downloadT>[1]) => downloadT(locale, key)
  const release = getOfficialReleaseCatalog()
  const published = release.publishedAt ? new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(release.publishedAt)) : '—'
  const windows = artifactFor(release.artifacts, 'nsis')
  const android = artifactFor(release.artifacts, 'apk')
  const deb = artifactFor(release.artifacts, 'deb')
  const rpm = artifactFor(release.artifacts, 'rpm')
  const appImage = artifactFor(release.artifacts, 'appimage')

  const cards: PlatformCardData[] = [
    { title: t('platform.windows'), text: t('platform.windowsText'), artifact: windows, brands: PLATFORM_BRANDS.windows, packageLabel: 'NSIS · .EXE' },
    { title: t('platform.android'), text: t('platform.androidText'), artifact: android, brands: PLATFORM_BRANDS.android, packageLabel: 'APK' },
    { title: t('platform.debian'), text: t('platform.debianText'), artifact: deb, brands: PLATFORM_BRANDS.debian, packageLabel: '.DEB' },
    { title: t('platform.rpm'), text: t('platform.rpmText'), artifact: rpm, brands: PLATFORM_BRANDS.rpm, packageLabel: '.RPM' },
    { title: t('platform.appimage'), text: t('platform.appimageText'), artifact: appImage, brands: PLATFORM_BRANDS.linux, packageLabel: 'APPIMAGE' },
  ]

  return <main className="ops-page min-h-screen">
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080809]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><ShieldCheck className="size-5 text-blue-400"/></span><span><span className="block text-sm font-black tracking-wide">GHOST NEXORA BOT</span><span className="block text-[10px] uppercase tracking-[.18em] text-zinc-600">OFFICIAL DISTRIBUTION</span></span></a>
        <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{t('back')}</a>
      </div>
    </header>

    <section className="relative mx-auto w-full max-w-[1480px] overflow-hidden px-5 pb-12 pt-16 md:px-8 lg:pt-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[70%] -translate-x-1/2 rounded-full bg-blue-600/[.07] blur-[110px]"/>
      <div className="relative max-w-4xl">
        <p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-blue-500">{t('page.eyebrow')}</p>
        <h1 className="mt-5 text-5xl font-black leading-[.98] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">{t('page.title')}</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-500">{t('page.intro')}</p>
      </div>

      <div className="relative mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.06] sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-[#101012] p-5"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">{t('release.current')}</span><strong className="mt-2 block text-xl text-white">v{release.version}</strong></div>
        <div className="bg-[#101012] p-5"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">{t('release.channel')}</span><strong className="mt-2 block uppercase text-blue-400">{release.channel}</strong></div>
        <div className="bg-[#101012] p-5"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">{t('release.source')}</span><strong className="mt-2 block truncate font-mono text-sm text-zinc-300" title={release.sourceSha}>{release.sourceSha ? release.sourceSha.slice(0, 12) : '—'}</strong></div>
        <div className="bg-[#101012] p-5"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">{t('release.date')}</span><strong className="mt-2 block text-sm text-zinc-300">{published}</strong></div>
      </div>
    </section>

    <section className="mx-auto w-full max-w-[1480px] px-5 py-10 md:px-8">
      <div className="mb-8 max-w-3xl"><p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-blue-500">{t('section.eyebrow')}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-white">{t('section.title')}</h2><p className="mt-3 text-sm leading-7 text-zinc-500">{t('section.text')}</p></div>
      {release.artifacts.length === 0 && <div className="ops-panel mb-6 flex gap-4 p-5"><ServerCog className="mt-0.5 size-5 shrink-0 text-amber-400"/><div><h3 className="font-bold text-zinc-200">{t('release.none')}</h3><p className="mt-1 text-sm leading-6 text-zinc-600">{t('release.noneText')}</p></div></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <PlatformCard key={card.title} {...card} t={t}/>)}</div>
    </section>

    <section className="mx-auto grid w-full max-w-[1480px] gap-4 px-5 py-14 md:px-8 lg:grid-cols-[1.1fr_.9fr]">
      <article className="ops-panel p-6 md:p-8"><Fingerprint className="size-6 text-blue-400"/><h2 className="mt-5 text-2xl font-black">{t('trust.title')}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">{t('trust.text')}</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="ops-stat min-h-0"><FileCheck2 className="size-4 text-emerald-400"/><strong className="mt-3 block text-sm">{t('trust.hash')}</strong></div><div className="ops-stat min-h-0"><ShieldCheck className="size-4 text-blue-400"/><strong className="mt-3 block text-sm">{t('trust.keys')}</strong></div><div className="ops-stat min-h-0"><TerminalSquare className="size-4 text-violet-400"/><strong className="mt-3 block text-sm">{t('trust.source')}</strong></div></div></article>
      <article className="ops-panel p-6 md:p-8"><ServerCog className="size-6 text-blue-400"/><h2 className="mt-5 text-2xl font-black">{t('vps.title')}</h2><p className="mt-3 text-sm leading-7 text-zinc-500">{t('vps.text')}</p><ol className="mt-6 space-y-3">{(['vps.step1','vps.step2','vps.step3','vps.step4'] as const).map((key, index)=><li key={key} className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-black/20 px-4 py-3 text-sm text-zinc-400"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-blue-500/10 font-mono text-[10px] font-black text-blue-400">{String(index + 1).padStart(2, '0')}</span>{t(key)}</li>)}</ol></article>
    </section>

    <footer className="mt-8 border-t border-white/[.07]"><div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 py-8 text-xs text-zinc-700 md:px-8"><span>Ghost Nexora Bot · Ghost Developer / Nexora</span><span className="flex items-center gap-2"><ShieldCheck className="size-3.5"/>Official Distribution</span></div></footer>
  </main>
}
