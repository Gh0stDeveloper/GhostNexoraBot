import { ShieldCheck } from 'lucide-react'
import type { OpsAdminAudit } from '../lib/ops'
import { type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'

export function AdminAuditTable({ rows, locale }: { rows: OpsAdminAudit[]; locale: WebLocale }) {
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'

  return <section className="ops-panel overflow-hidden">
    <div className="flex items-start gap-3 border-b border-white/[.08] px-5 py-5">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-400"/>
      <div><h2 className="font-bold text-white">{t('audit.adminTitle')}</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{t('audit.adminText')}</p></div>
    </div>
    {rows.length ? <div className="overflow-x-auto">
      <table className="ops-table min-w-[880px]">
        <thead><tr><th>{t('audit.actor')}</th><th>{t('audit.action')}</th><th>{t('audit.target')}</th><th>{t('audit.status')}</th><th>{t('audit.date')}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="font-mono text-xs text-zinc-400">{row.actor}</td>
          <td><span className="font-mono text-xs text-zinc-300">{row.action}</span>{row.error && <p className="mt-1 max-w-80 truncate font-mono text-[10px] text-red-400/70" title={row.error}>{row.error}</p>}</td>
          <td className="max-w-80 truncate font-mono text-xs text-zinc-500" title={row.target ?? undefined}>{row.target ?? t('audit.noTarget')}</td>
          <td><span className={row.status === 'accepted' ? 'ops-badge-good' : 'ops-badge-bad'}>{row.status === 'accepted' ? t('audit.accepted') : t('audit.failed')}</span></td>
          <td className="text-xs text-zinc-500">{new Date(row.createdAt).toLocaleString(intl)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="px-5 py-10 text-center text-sm text-zinc-600">{t('audit.none')}</div>}
  </section>
}
