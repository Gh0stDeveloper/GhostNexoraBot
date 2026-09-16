import { Android, ArrowLeft, Box, CheckCircle2, Download, FileCheck2, Fingerprint, Laptop, PackageCheck, ServerCog, ShieldCheck, TerminalSquare } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'
import { downloadT } from '../../lib/downloads-i18n'
import { getOfficialReleaseCatalog, type OfficialReleaseArtifact, type ReleaseKind } from '../../lib/releases'

export const dynamic = 'force-dynamic'

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

function PlatformCard({ icon, title, text, artifact, t }: {
  icon: React.ReactNode
  title: string
  text: string
  artifact?: OfficialReleaseArtifact
  t: (key: Parameters<typeof downloadT>[1]) => string
}) {
  return <article className="group relative overflow-hidden rounded-2xl border border-white/[.08] bg-[#101012] p-5 shadow-[0_18px_55px_rgba(0,0,0,.22)] transition hover:-translate-y-0.5 hover:border-blue-500/25">
    <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-blue-500/[.055] blur-3xl"/>
    <div className="relative flex items-start justify-between gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08] text-blue-400">{icon}</span>
      {artifact ? <span className="ops-badge-good"><CheckCircle2 className="mr-1 size-3"/>{artifact.arch}</span> : <span className="ops-badge-warn">{t('artifact.unavailable')}</span>}
    </div>
    <h3 className="relative mt-5 text-lg font-black tracking-tight text-white">{title}</h3>
    <p className="relative mt-2 min-h-16 text-sm leading-6 text-zinc-500">{text}</p>
    {artifact ? <>
      <div className="relative mt-5 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block uppercase tracking-wider text-zinc-700">{t('artifact.size')}</span><strong className="mt-1 block text-zinc-300">{formatBytes(artifact.sizeBytes)}</strong></div>
        <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block uppercase tracking-wider text-zinc-700">{t('artifact.signed')}</span><strong className="mt-1 block text-zinc-300">{signatureLabel(artifact, t)}</strong></div>
      </div>
      <div className="relative mt-3 rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block text-[10px] uppercase tracking-wider text-zinc-700">{t('artifact.hash')}</span><code className="mt-1 block truncate font-mono text-[11px] text-zinc-500" title={artifact.sha256}>{artifact.sha256}</code></div>
      <a className="ops-button-primary relative mt-4 w-full" href={`/api/releases/download?id=${encodeURIComponent(artifact.id)}`}><Download className="size-4"/>{t('artifact.download')} · {artifact.filename}</a>
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

  const cards = [
    [Laptop, t('platform.windows'), t('platform.windowsText'), windows],
    [Android, t('platform.android'), t('platform.androidText'), android],
    [PackageCheck, t('platform.debian'), t('platform.debianText'), deb],
    [Box, t('platform.rpm'), t('platform.rpmText'), rpm],
    [TerminalSquare, t('platform.appimage'), t('platform.appimageText'), appImage],
  ] as const

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(([Icon, title, text, artifact]) => <PlatformCard key={title} icon={<Icon className="size-5"/>} title={title} text={text} artifact={artifact} t={t}/>)}</div>
    </section>

    <section className="mx-auto grid w-full max-w-[1480px] gap-4 px-5 py-14 md:px-8 lg:grid-cols-[1.1fr_.9fr]">
      <article className="ops-panel p-6 md:p-8"><Fingerprint className="size-6 text-blue-400"/><h2 className="mt-5 text-2xl font-black">{t('trust.title')}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">{t('trust.text')}</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="ops-stat min-h-0"><FileCheck2 className="size-4 text-emerald-400"/><strong className="mt-3 block text-sm">{t('trust.hash')}</strong></div><div className="ops-stat min-h-0"><ShieldCheck className="size-4 text-blue-400"/><strong className="mt-3 block text-sm">{t('trust.keys')}</strong></div><div className="ops-stat min-h-0"><TerminalSquare className="size-4 text-violet-400"/><strong className="mt-3 block text-sm">{t('trust.source')}</strong></div></div></article>
      <article className="ops-panel p-6 md:p-8"><ServerCog className="size-6 text-blue-400"/><h2 className="mt-5 text-2xl font-black">{t('vps.title')}</h2><p className="mt-3 text-sm leading-7 text-zinc-500">{t('vps.text')}</p><ol className="mt-6 space-y-3">{(['vps.step1','vps.step2','vps.step3','vps.step4'] as const).map((key, index)=><li key={key} className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-black/20 px-4 py-3 text-sm text-zinc-400"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-blue-500/10 font-mono text-[10px] font-black text-blue-400">{String(index + 1).padStart(2, '0')}</span>{t(key)}</li>)}</ol></article>
    </section>

    <footer className="mt-8 border-t border-white/[.07]"><div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 py-8 text-xs text-zinc-700 md:px-8"><span>Ghost Nexora Bot · Ghost Developer / Nexora</span><span className="flex items-center gap-2"><ShieldCheck className="size-3.5"/>Official Distribution</span></div></footer>
  </main>
}
