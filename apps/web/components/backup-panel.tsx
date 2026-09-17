import { Archive, Database, Download, Plus, ShieldCheck } from 'lucide-react'
import { listWebBackups } from '../lib/backups'
import { webIntlLocale, type WebLocale } from '../lib/i18n'

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export async function BackupPanel({ locale }: { locale: WebLocale }) {
  const intl = webIntlLocale(locale)
  const backups = await listWebBackups().catch(() => [])
  const copy = locale === 'es' ? {
    title: 'Backups operativos',
    text: 'Copias diarias y manuales de configuración, grupos, economía, usuarios y subbots. Las credenciales de sesión de WhatsApp quedan fuera del archivo.',
    create: 'Crear backup ahora',
    automatic: 'Backup automático cada 24 horas',
    retention: 'Se conservan hasta 30 copias',
    protected: 'SESSION_DIR excluido',
    empty: 'Todavía no hay backups. Crea el primero desde este panel.',
    download: 'Descargar',
    latest: 'Más reciente',
  } : {
    title: 'Operational backups',
    text: 'Daily and manual snapshots of settings, groups, economy, users and subbots. WhatsApp session credentials stay outside the archive.',
    create: 'Create backup now',
    automatic: 'Automatic backup every 24 hours',
    retention: 'Up to 30 snapshots are retained',
    protected: 'SESSION_DIR excluded',
    empty: 'No backups yet. Create the first one from this panel.',
    download: 'Download',
    latest: 'Latest',
  }

  return <section className="ops-panel overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Archive className="size-5 text-blue-400"/></span>
        <div><h2 className="font-bold text-white">{copy.title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{copy.text}</p></div>
      </div>
      <form action="/api/control" method="post">
        <input type="hidden" name="section" value="management"/>
        <input type="hidden" name="action" value="create_backup"/>
        <button className="ops-button-primary"><Plus className="size-4"/>{copy.create}</button>
      </form>
    </div>

    <div className="grid gap-3 border-b border-white/[.08] p-5 sm:grid-cols-3">
      <div className="ops-node"><Database className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-500">{copy.automatic}</p></div>
      <div className="ops-node"><Archive className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-500">{copy.retention}</p></div>
      <div className="ops-node"><ShieldCheck className="size-4 text-emerald-400"/><p className="mt-3 text-xs text-zinc-500">{copy.protected}</p></div>
    </div>

    {backups.length ? <div className="overflow-x-auto">
      <table className="ops-table min-w-[720px]">
        <thead><tr><th>Backup</th><th>{locale === 'es' ? 'Fecha' : 'Date'}</th><th>{locale === 'es' ? 'Tamaño' : 'Size'}</th><th className="text-right">{locale === 'es' ? 'Acción' : 'Action'}</th></tr></thead>
        <tbody>{backups.map((backup, index) => <tr key={backup.id}>
          <td><div className="flex items-center gap-2"><span className="font-mono text-xs text-zinc-300">{backup.fileName}</span>{index === 0 && <span className="ops-badge-good">{copy.latest}</span>}</div></td>
          <td className="text-zinc-500">{new Date(backup.createdAt).toLocaleString(intl)}</td>
          <td className="font-mono text-zinc-400">{formatBytes(backup.size)}</td>
          <td className="text-right"><a className="ops-button-muted" href={`/api/backups/download?id=${encodeURIComponent(backup.id)}`}><Download className="size-4"/>{copy.download}</a></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="px-5 py-10 text-center text-sm text-zinc-600">{copy.empty}</div>}
  </section>
}
