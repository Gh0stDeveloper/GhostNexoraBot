import { Archive, Database, Download, Plus, RotateCcw, ShieldCheck } from 'lucide-react'
import { listWebBackups } from '../lib/backups'
import { webIntlLocale, type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { ConfirmSubmitButton } from './ops-client-controls'

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export async function BackupPanel({ locale, csrfToken }: { locale: WebLocale; csrfToken: string }) {
  const intl = webIntlLocale(locale)
  const backups = await listWebBackups().catch(() => [])
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  return <section className="ops-panel overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Archive className="size-5 text-blue-400"/></span>
        <div><h2 className="font-bold text-white">{t('backup.title')}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{t('backup.text')}</p></div>
      </div>
      <form action="/api/control" method="post">
        <input type="hidden" name="_csrf" value={csrfToken}/>
        <input type="hidden" name="section" value="management"/>
        <input type="hidden" name="action" value="create_backup"/>
        <button className="ops-button-primary"><Plus className="size-4"/>{t('backup.create')}</button>
      </form>
    </div>

    <div className="grid gap-3 border-b border-white/[.08] p-5 sm:grid-cols-3">
      <div className="ops-node"><Database className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-500">{t('backup.automatic')}</p></div>
      <div className="ops-node"><Archive className="size-4 text-blue-400"/><p className="mt-3 text-xs text-zinc-500">{t('backup.retention')}</p></div>
      <div className="ops-node"><ShieldCheck className="size-4 text-emerald-400"/><p className="mt-3 text-xs text-zinc-500">{t('backup.protected')}</p></div>
    </div>

    <div className="border-b border-white/[.08] px-5 py-3 text-xs leading-5 text-amber-300/70">{t('backup.restoreHint')}</div>

    {backups.length ? <div className="overflow-x-auto">
      <table className="ops-table min-w-[820px]">
        <thead><tr><th>Backup</th><th>{t('backup.date')}</th><th>{t('backup.size')}</th><th className="text-right">{t('backup.action')}</th></tr></thead>
        <tbody>{backups.map((backup, index) => <tr key={backup.id}>
          <td><div className="flex items-center gap-2"><span className="font-mono text-xs text-zinc-300">{backup.fileName}</span>{index === 0 && <span className="ops-badge-good">{t('backup.latest')}</span>}</div></td>
          <td className="text-zinc-500">{new Date(backup.createdAt).toLocaleString(intl)}</td>
          <td className="font-mono text-zinc-400">{formatBytes(backup.size)}</td>
          <td>
            <div className="flex justify-end gap-2">
              <a className="ops-button-muted" href={`/api/backups/download?id=${encodeURIComponent(backup.id)}`}><Download className="size-4"/>{t('backup.download')}</a>
              <form action="/api/control" method="post">
                <input type="hidden" name="_csrf" value={csrfToken}/>
                <input type="hidden" name="section" value="management"/>
                <input type="hidden" name="action" value="restore_backup"/>
                <input type="hidden" name="backupId" value={backup.id}/>
                <ConfirmSubmitButton className="ops-button-danger" confirmText={t('backup.restoreConfirm')}><RotateCcw className="size-4"/>{t('backup.restore')}</ConfirmSubmitButton>
              </form>
            </div>
          </td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="px-5 py-10 text-center text-sm text-zinc-600">{t('backup.empty')}</div>}
  </section>
}
