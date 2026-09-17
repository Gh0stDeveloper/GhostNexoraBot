import { Activity, Cpu, Gauge, MemoryStick, ServerCog, Timer } from 'lucide-react'
import { type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { readRuntimeDiagnostics } from '../lib/runtime-diagnostics'

function bytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let current = Math.max(0, value)
  let unit = 0
  while (current >= 1024 && unit < units.length - 1) { current /= 1024; unit += 1 }
  return `${current >= 10 || unit === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`
}

function duration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function RuntimeDiagnosticsPanel({ instanceKey, locale }: { instanceKey: string; locale: WebLocale }) {
  const data = readRuntimeDiagnostics(instanceKey)
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  return <section className="ops-panel overflow-hidden">
    <div className="flex flex-col gap-3 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3"><Activity className="mt-0.5 size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">{t('diagnostics.title')}</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{t('diagnostics.text')}</p></div></div>
      {data && <span className={data.fresh ? 'ops-badge-good' : 'ops-badge-warn'}>{data.fresh ? t('diagnostics.online') : t('diagnostics.stale')}</span>}
    </div>
    {data ? <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <article className="ops-stat min-h-0"><Cpu className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.cpu')}</p><strong className="mt-1 block font-mono text-lg text-zinc-100">{data.cpuPercent.toFixed(1)}%</strong></article>
      <article className="ops-stat min-h-0"><MemoryStick className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.ram')}</p><strong className="mt-1 block font-mono text-lg text-zinc-100">{bytes(data.rssBytes)}</strong></article>
      <article className="ops-stat min-h-0"><Gauge className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.heap')}</p><strong className="mt-1 block font-mono text-lg text-zinc-100">{bytes(data.heapUsedBytes)} / {bytes(data.heapTotalBytes)}</strong></article>
      <article className="ops-stat min-h-0"><Timer className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.uptime')}</p><strong className="mt-1 block font-mono text-lg text-zinc-100">{duration(data.uptimeSeconds)}</strong></article>
      <article className="ops-stat min-h-0"><ServerCog className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.ollama')}</p><strong className={data.ollamaEnabled ? 'mt-1 block text-lg text-emerald-400' : 'mt-1 block text-lg text-zinc-500'}>{data.ollamaEnabled ? t('diagnostics.online') : t('diagnostics.offline')}</strong></article>
      <article className="ops-stat min-h-0"><Activity className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-600">{t('diagnostics.node')}</p><strong className="mt-1 block font-mono text-lg text-zinc-100">{data.nodeVersion}</strong><span className="mt-1 block font-mono text-[10px] text-zinc-700">PID {data.pid}</span></article>
    </div> : <div className="px-5 py-10 text-center text-sm text-zinc-600">{t('diagnostics.empty')}</div>}
  </section>
}
