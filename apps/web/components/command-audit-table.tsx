'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpsCommand } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'

function latency(us: number, intl: string) {
  if (!us) return '0 µs'
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`
  return `${Math.round(us).toLocaleString(intl)} µs`
}

export function CommandAuditTable({ commands, locale }: { commands: OpsCommand[]; locale: WebLocale }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1]) => webT(locale, key)
  const labels: Record<OpsCommand['status'], string> = {
    optimal: t('audit.optimal'), warning: t('audit.warning'), slow: t('audit.slow'), critical: t('audit.critical'),
  }
  const rows = useMemo(() => commands.filter((command) => !normalized || [
    command.commandName,
    command.category,
    command.description,
    command.status,
    labels[command.status],
  ].some((value) => value.toLowerCase().includes(normalized))), [commands, normalized, labels])

  return <section className="ops-panel overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-base font-bold text-white">{t('audit.title')}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t('audit.subtitle')}</p>
      </div>
      <label className="relative block w-full md:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="ops-input pl-10" placeholder={t('audit.filter')} />
      </label>
    </div>
    <div className="overflow-x-auto">
      <table className="ops-table min-w-[1050px]">
        <thead><tr><th>{t('audit.command')}</th><th>{t('audit.invocations')}</th><th>{t('audit.success')}</th><th>{t('audit.min')}</th><th>{t('audit.avg')}</th><th>{t('audit.max')}</th><th>{t('audit.heap')}</th><th>{t('audit.status')}</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((command) => <tr key={command.commandName}>
            <td><div className="font-mono font-bold text-blue-400">.{command.commandName}</div><div className="mt-1 max-w-xs truncate text-[11px] text-zinc-600">{command.category} · {command.description}</div></td>
            <td className="font-mono">{command.invocations.toLocaleString(intl)}</td>
            <td><span className={command.successRate >= 99 ? 'ops-badge-good' : command.successRate >= 95 ? 'ops-badge-warn' : 'ops-badge-bad'}>{command.successRate.toFixed(command.invocations ? 1 : 0)}%</span></td>
            <td className="font-mono">{latency(command.minUs, intl)}</td>
            <td className="font-mono font-semibold">{latency(command.avgUs, intl)}</td>
            <td className={`font-mono ${command.maxUs >= 1_000_000 ? 'text-red-400' : ''}`}>{latency(command.maxUs, intl)}</td>
            <td className={`font-mono ${command.heapDeltaKb > 0 ? 'text-zinc-300' : 'text-zinc-500'}`}>{command.heapDeltaKb > 0 ? '+' : ''}{command.heapDeltaKb.toLocaleString(intl)} KB</td>
            <td><span className={command.status === 'optimal' ? 'ops-badge-good' : command.status === 'warning' ? 'ops-badge-warn' : 'ops-badge-bad'}>{labels[command.status]}</span></td>
          </tr>) : <tr><td colSpan={8} className="py-10 text-center text-zinc-500">{t('audit.empty')}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
