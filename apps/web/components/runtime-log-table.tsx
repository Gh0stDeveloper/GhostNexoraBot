import { ScrollText } from 'lucide-react'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { readOpsRuntimeLogs } from '../lib/ops-observability'
import type { WebLocale } from '../lib/i18n'

function levelClass(level: string) {
  if (level === 'error') return 'ops-badge-bad'
  if (level === 'warn') return 'ops-badge-warn'
  if (level === 'info') return 'ops-badge-good'
  return 'ops-badge'
}

export function RuntimeLogTable({ instanceKey, locale }: { instanceKey: string; locale: WebLocale }) {
  const rows = readOpsRuntimeLogs(instanceKey, 100)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  return <section className="ops-panel overflow-hidden">
    <div className="flex items-center gap-3 border-b border-white/[.08] px-5 py-5">
      <ScrollText className="size-5 text-blue-400"/>
      <div><h2 className="font-bold text-white">{opsExtraT(locale, 'logs.title')}</h2><p className="mt-1 text-xs text-zinc-500">{opsExtraT(locale, 'logs.text')}</p></div>
      <span className="ml-auto font-mono text-xs text-zinc-600">{rows.length}</span>
    </div>
    {rows.length ? <div className="max-h-[540px] overflow-auto">
      <table className="ops-table min-w-[880px]">
        <thead><tr><th>{opsExtraT(locale, 'logs.level')}</th><th>{opsExtraT(locale, 'logs.source')}</th><th>{opsExtraT(locale, 'logs.message')}</th><th>{opsExtraT(locale, 'logs.date')}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><span className={levelClass(row.level)}>{row.level.toUpperCase()}</span></td>
          <td className="font-mono text-xs text-blue-300/70">{row.source}</td>
          <td className="max-w-[620px] font-mono text-xs text-zinc-400"><span className="break-words">{row.message}</span></td>
          <td className="whitespace-nowrap text-xs text-zinc-600">{new Date(row.createdAt).toLocaleString(intl)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="px-5 py-8 text-center text-sm text-zinc-600">{opsExtraT(locale, 'logs.none')}</div>}
  </section>
}
