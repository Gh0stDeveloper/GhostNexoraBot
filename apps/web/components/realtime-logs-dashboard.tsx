'use client'

import {
  Activity,
  AlertTriangle,
  Braces,
  Bug,
  CirclePause,
  CirclePlay,
  Download,
  MessageCircleMore,
  Radio,
  Search,
  Send,
  Server,
  SquareTerminal,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import type {
  WebOpsLogChannel,
  WebOpsLogLevel,
  WebOpsRuntimeLog,
} from '../lib/ops-observability'

type Counts = {
  total: number
  errors: number
  warnings: number
  commands: number
  api: number
  downloads: number
}

function levelClass(level: WebOpsLogLevel) {
  if (level === 'error') return 'ops-badge-bad'
  if (level === 'warn') return 'ops-badge-warn'
  if (level === 'info') return 'ops-badge-good'
  return 'ops-badge'
}

function categoryClass(category: string) {
  if (category === 'whatsapp') return 'text-emerald-300'
  if (category === 'discord') return 'text-indigo-300'
  if (category === 'telegram') return 'text-sky-300'
  if (category === 'api') return 'text-violet-300'
  if (category === 'download') return 'text-cyan-300'
  if (category === 'command') return 'text-blue-300'
  if (category === 'security') return 'text-amber-300'
  return 'text-zinc-400'
}

export function RealtimeLogsDashboard({
  initialRows,
  initialCounts,
  instanceKey,
  instanceLabel,
  locale,
}: {
  initialRows: WebOpsRuntimeLog[]
  initialCounts: Counts
  instanceKey: string
  instanceLabel: string
  locale: WebLocale
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const [rows, setRows] = useState(initialRows)
  const [counts, setCounts] = useState(initialCounts)
  const [channel, setChannel] = useState<WebOpsLogChannel>('all')
  const [level, setLevel] = useState<'all' | WebOpsLogLevel>('all')
  const [query, setQuery] = useState('')
  const [live, setLive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const latestId = useMemo(() => rows.reduce((max, row) => Math.max(max, row.id), 0), [rows])

  const load = useCallback(async (reset: boolean) => {
    const params = new URLSearchParams({
      instance: instanceKey,
      channel,
      level,
      limit: reset ? '200' : '120',
    })
    if (query.trim()) params.set('q', query.trim())
    if (!reset && latestId > 0) params.set('afterId', String(latestId))

    if (reset) setLoading(true)
    try {
      const response = await fetch(`/api/ops/logs?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const body = await response.json() as {
        ok?: boolean
        rows?: WebOpsRuntimeLog[]
        counts?: Counts
      }
      if (!response.ok || !body.ok || !Array.isArray(body.rows)) throw new Error('logs_unavailable')

      const incoming = body.rows
      if (reset) {
        setRows(incoming)
      } else if (incoming.length) {
        setRows((current) => {
          const merged = new Map<number, WebOpsRuntimeLog>()
          for (const row of [...incoming, ...current]) merged.set(row.id, row)
          return [...merged.values()].sort((a, b) => b.id - a.id).slice(0, 300)
        })
      }
      if (body.counts) setCounts(body.counts)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      if (reset) setLoading(false)
    }
  }, [channel, instanceKey, latestId, level, query])

  useEffect(() => {
    void load(true)
  // latestId is intentionally excluded: filter changes reload the current window.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, level, query, instanceKey])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false)
    }, 3_000)
    return () => window.clearInterval(timer)
  }, [live, load])

  const channels: Array<{
    id: WebOpsLogChannel
    label: string
    Icon: typeof Activity
  }> = [
    { id: 'all', label: x('realtimeLogs.all'), Icon: Activity },
    { id: 'whatsapp', label: x('realtimeLogs.whatsapp'), Icon: MessageCircleMore },
    { id: 'discord', label: x('realtimeLogs.discord'), Icon: Server },
    { id: 'telegram', label: x('realtimeLogs.telegram'), Icon: Send },
    { id: 'errors', label: x('realtimeLogs.errors'), Icon: Bug },
    { id: 'downloads', label: x('realtimeLogs.downloads'), Icon: Download },
    { id: 'api', label: x('realtimeLogs.api'), Icon: Braces },
    { id: 'commands', label: x('realtimeLogs.commands'), Icon: SquareTerminal },
  ]

  const stats = [
    [Activity, x('realtimeLogs.total'), counts.total],
    [Bug, x('realtimeLogs.errorCount'), counts.errors],
    [AlertTriangle, x('realtimeLogs.warningCount'), counts.warnings],
    [SquareTerminal, x('realtimeLogs.commandCount'), counts.commands],
    [Braces, x('realtimeLogs.apiCount'), counts.api],
    [Download, x('realtimeLogs.downloadCount'), counts.downloads],
  ] as const

  const intl = locale === 'es' ? 'es-MX' : 'en-US'

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-5 text-blue-400"/>
            <h2 className="text-lg font-black text-white">{x('realtimeLogs.title')}</h2>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{x('realtimeLogs.subtitle')} · {instanceLabel}</p>
        </div>
        <button type="button" onClick={() => setLive((value) => !value)} className="ops-button-muted">
          {live ? <CirclePause className="size-4 text-emerald-400"/> : <CirclePlay className="size-4 text-zinc-500"/>}
          {live ? x('realtimeLogs.live') : x('realtimeLogs.paused')} · 3s
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/[.06] p-4">
        {channels.map(({ id, label, Icon }) => <button
          key={id}
          type="button"
          onClick={() => setChannel(id)}
          className={channel === id ? 'ops-button-primary' : 'ops-button-muted'}
        >
          <Icon className="size-3.5"/>{label}
        </button>)}
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-[1fr_170px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600"/>
          <input
            className="ops-input w-full pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder={x('realtimeLogs.search')}
          />
        </div>
        <select className="ops-input" value={level} onChange={(event) => setLevel(event.target.value as 'all' | WebOpsLogLevel)}>
          <option value="all">{x('realtimeLogs.all')} · {x('realtimeLogs.level')}</option>
          <option value="debug">{x('realtimeLogs.debug')}</option>
          <option value="info">{x('realtimeLogs.info')}</option>
          <option value="warn">{x('realtimeLogs.warn')}</option>
          <option value="error">{x('realtimeLogs.error')}</option>
        </select>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {stats.map(([Icon, label, value]) => <article key={label} className="ops-stat">
        <Icon className="size-4 text-blue-400"/>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
        <p className="mt-1 text-xl font-black text-white">{Number(value).toLocaleString(intl)}</p>
      </article>)}
    </section>

    {failed ? <div className="rounded-xl border border-amber-500/15 bg-amber-500/[.05] px-4 py-3 text-xs text-amber-200/80">{x('realtimeLogs.connectionError')}</div> : null}

    <section className="ops-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[.08] px-5 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-600">
          <span>{x('realtimeLogs.retention')}</span>
          <span>{x('realtimeLogs.sanitized')}</span>
        </div>
        <span className="font-mono text-xs text-zinc-600">{loading ? '…' : rows.length}</span>
      </div>

      {rows.length ? <div className="max-h-[680px] overflow-auto">
        <table className="ops-table min-w-[980px]">
          <thead><tr>
            <th>{x('realtimeLogs.level')}</th>
            <th>{x('realtimeLogs.category')}</th>
            <th>{x('realtimeLogs.source')}</th>
            <th>{x('realtimeLogs.event')}</th>
            <th>{x('realtimeLogs.time')}</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td><span className={levelClass(row.level)}>{row.level.toUpperCase()}</span></td>
            <td className={`font-mono text-[10px] font-bold uppercase ${categoryClass(row.category)}`}>{row.category}</td>
            <td className="max-w-56 truncate font-mono text-xs text-blue-300/70" title={row.source}>{row.source}</td>
            <td className="max-w-[620px] font-mono text-xs text-zinc-400"><span className="break-words">{row.message}</span></td>
            <td className="whitespace-nowrap text-xs text-zinc-600">{new Date(row.createdAt).toLocaleString(intl)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="grid min-h-44 place-items-center p-8 text-center">
        <div><Radio className="mx-auto size-7 text-zinc-700"/><p className="mt-3 text-sm text-zinc-600">{x('realtimeLogs.none')}</p></div>
      </div>}
    </section>
  </div>
}
