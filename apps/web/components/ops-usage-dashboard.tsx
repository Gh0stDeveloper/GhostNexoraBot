'use client'

import { Activity, BarChart3, Clock3, Gauge, History, TrendingDown, TrendingUp, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpsUsageAnalytics, OpsUsageRank } from '../lib/ops'

type Period = 'historical' | 'today'

type Props = {
  analytics: OpsUsageAnalytics
  instanceLabel: string
  locale: 'es' | 'en'
}

function compact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, Math.round(value)))
}

function duration(ms: number, language: Props['locale']) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean)
  return parts.join(' ') || (language === 'en' ? '<1m' : '<1m')
}

function Ranking({ rows, locale, emptyLabel }: { rows: OpsUsageRank[]; locale: string; emptyLabel: string }) {
  if (!rows.length) return <div className="ops-empty-state compact"><BarChart3 className="size-5"/><p>{emptyLabel}</p></div>
  return <div className="divide-y divide-white/[.06] px-5">
    {rows.slice(0, 5).map((row, index) => <div key={row.key} className="flex items-center gap-3 py-4">
      <span className="w-5 shrink-0 text-center font-mono text-xs font-bold text-zinc-500">{index + 1}</span>
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[.08] bg-white/[.04] text-sm font-black text-zinc-200">{row.label.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-zinc-100">{row.label}</p><p className="mt-1 truncate text-xs text-zinc-600">{row.secondary}</p></div>
      <div className="text-right"><p className="font-mono text-sm font-bold text-zinc-200">{row.requests.toLocaleString(locale)}</p><p className="mt-1 text-[10px] text-zinc-600">{Math.round(row.successRate)}% ok</p></div>
    </div>)}
  </div>
}

export function OpsUsageDashboard({ analytics, instanceLabel, locale }: Props) {
  const numberLocale = locale === 'en' ? 'en-US' : 'es-MX'
  const [period, setPeriod] = useState<Period>('today')
  const topUsers = period === 'today' ? analytics.topUsersToday : analytics.topUsersHistorical
  const topCommands = period === 'today' ? analytics.topCommandsToday : analytics.topCommandsHistorical
  const labels = locale === 'en'
    ? { title: 'Usage analytics', subtitle: 'Real command activity for this bot instance.', uptime: 'Uptime', latency: 'Average latency', total: 'Total requests', minute: 'Last minute', hour: 'Last hour', growth: 'Growth', requests: 'requests', chart: 'Requests per minute', heatmap: 'Activity heatmap · by hour', last7: 'last 7 days', users: 'Top 5 users', commands: 'Top commands', history: 'Historical', today: 'Today', less: 'less', more: 'more', empty: 'No data yet.', max: 'max' }
    : { title: 'Analítica de uso', subtitle: 'Actividad real de comandos para esta instancia del bot.', uptime: 'Uptime', latency: 'Latencia promedio', total: 'Requests totales', minute: 'Último minuto', hour: 'Última hora', growth: 'Crecimiento', requests: 'requests', chart: 'Requests por minuto', heatmap: 'Mapa de calor · actividad por hora', last7: 'últimos 7 días', users: 'Top 5 usuarios', commands: 'Top comandos', history: 'Histórico', today: 'Hoy', less: 'menos', more: 'más', empty: 'Sin datos todavía.', max: 'máx.' }

  const chart = useMemo(() => {
    const rows = analytics.recentSeries.length ? analytics.recentSeries : [{ at: Date.now(), requests: 0, averageLatencyMs: 0 }]
    const max = Math.max(1, ...rows.map((row) => row.requests))
    const width = 1000
    const height = 220
    const padX = 28
    const padY = 18
    const innerW = width - padX * 2
    const innerH = height - padY * 2
    const points = rows.map((row, index) => {
      const x = padX + (rows.length <= 1 ? innerW : index / (rows.length - 1) * innerW)
      const y = padY + innerH - row.requests / max * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return { points, max, width, height }
  }, [analytics.recentSeries])

  const heatMax = Math.max(1, ...analytics.heatmap.flatMap((day) => day.hours))
  const dayFormatter = new Intl.DateTimeFormat(numberLocale, { weekday: 'short' })
  const timeFormatter = new Intl.DateTimeFormat(numberLocale, { hour: '2-digit', minute: '2-digit' })
  const latestPoint = analytics.recentSeries.at(-1)
  const growthUp = analytics.growthPct >= 0

  const cards = [
    [Clock3, labels.uptime, duration(analytics.uptimeMs, locale), locale === 'en' ? 'without interruption' : 'desde el inicio'],
    [Gauge, labels.latency, `${Math.round(analytics.averageLatencyMs).toLocaleString(numberLocale)}ms`, latestPoint ? `${locale === 'en' ? 'latest' : 'último'}: ${Math.round(latestPoint.averageLatencyMs).toLocaleString(numberLocale)}ms` : '—'],
    [BarChart3, labels.total, analytics.totalRequests.toLocaleString(numberLocale), locale === 'en' ? 'recorded executions' : 'ejecuciones registradas'],
    [Activity, labels.minute, analytics.lastMinute.toLocaleString(numberLocale), labels.requests],
    [Activity, labels.hour, analytics.lastHour.toLocaleString(numberLocale), labels.requests],
    [growthUp ? TrendingUp : TrendingDown, labels.growth, `${analytics.growthPct >= 0 ? '+' : ''}${analytics.growthPct.toFixed(1)}%`, locale === 'en' ? 'vs previous hour' : 'vs hora anterior'],
  ] as const

  return <section className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black text-white">{labels.title}</h2><p className="mt-1 text-xs text-zinc-500">{labels.subtitle} <span className="font-mono text-zinc-600">{instanceLabel}</span></p></div><span className="ops-badge-good">LIVE</span></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(([Icon, label, value, note]) => <article key={label} className="ops-stat"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl border border-white/[.07] bg-black/20"><Icon className="size-4 text-zinc-300"/></span><p className="text-xs font-semibold uppercase tracking-[.12em] text-zinc-500">{label}</p></div><p className="mt-4 text-2xl font-black tracking-tight text-zinc-100">{value}</p><p className="mt-1 text-xs text-zinc-600">{note}</p></article>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
      <article className="ops-panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><h3 className="font-bold text-zinc-100">{labels.chart}</h3><p className="mt-1 text-xs text-zinc-600">60 min · {labels.max} {chart.max.toLocaleString(numberLocale)}</p></div>{latestPoint && <span className="font-mono text-[10px] text-zinc-600">{timeFormatter.format(new Date(latestPoint.at))}</span>}</div><div className="p-4"><div className="ops-chart-frame"><svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-64 w-full" role="img" aria-label={labels.chart}><line x1="28" y1="202" x2="972" y2="202" stroke="currentColor" className="text-white/[.08]"/><line x1="28" y1="110" x2="972" y2="110" stroke="currentColor" className="text-white/[.05]"/><line x1="28" y1="18" x2="972" y2="18" stroke="currentColor" className="text-white/[.05]"/><polyline points={chart.points} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" className="text-blue-400"/></svg></div></div></article>

      <article className="ops-panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div className="flex items-center gap-2"><UsersRound className="size-4 text-zinc-400"/><h3 className="font-bold text-zinc-100">{labels.users}</h3></div><div className="flex rounded-xl border border-white/[.07] bg-black/20 p-1 text-xs"><button type="button" onClick={() => setPeriod('historical')} className={`rounded-lg px-3 py-2 font-semibold ${period === 'historical' ? 'bg-white/[.08] text-white' : 'text-zinc-600'}`}><History className="mr-1 inline size-3"/>{labels.history}</button><button type="button" onClick={() => setPeriod('today')} className={`rounded-lg px-3 py-2 font-semibold ${period === 'today' ? 'bg-white/[.08] text-white' : 'text-zinc-600'}`}>{labels.today}</button></div></div><Ranking rows={topUsers} locale={numberLocale} emptyLabel={labels.empty}/></article>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
      <article className="ops-panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><h3 className="font-bold text-zinc-100">{labels.heatmap}</h3><p className="mt-1 text-xs text-zinc-600">{labels.last7}</p></div><span className="text-xs text-zinc-600">{compact(analytics.todayRequests, numberLocale)} {labels.today.toLowerCase()}</span></div><div className="overflow-x-auto p-5"><div className="min-w-[680px] space-y-2">{analytics.heatmap.map((day) => <div key={day.at} className="grid grid-cols-[48px_repeat(24,minmax(14px,1fr))] items-center gap-1"><span className="text-[10px] font-semibold text-zinc-600">{dayFormatter.format(new Date(day.at))}</span>{day.hours.map((count, hour) => { const ratio = count / heatMax; const opacity = count ? Math.max(.14, ratio) : .04; return <span key={hour} title={`${hour}:00 · ${count} ${labels.requests}`} className="aspect-square rounded-[3px] border border-white/[.025] bg-white" style={{ opacity }}/>} )}</div>)}</div><div className="mt-4 flex justify-end gap-2 text-[10px] text-zinc-600"><span>{labels.less}</span><span className="size-3 rounded-sm bg-white/10"/><span className="size-3 rounded-sm bg-white/25"/><span className="size-3 rounded-sm bg-white/45"/><span className="size-3 rounded-sm bg-white/70"/><span className="size-3 rounded-sm bg-white"/><span>{labels.more}</span></div></div></article>

      <article className="ops-panel overflow-hidden"><div className="border-b border-white/[.07] px-5 py-4"><h3 className="font-bold text-zinc-100">{labels.commands}</h3><p className="mt-1 text-xs text-zinc-600">{period === 'today' ? labels.today : labels.history}</p></div><Ranking rows={topCommands} locale={numberLocale} emptyLabel={labels.empty}/></article>
    </div>
  </section>
}
