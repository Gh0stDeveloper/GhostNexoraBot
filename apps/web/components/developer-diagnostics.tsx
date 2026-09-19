import { GitBranch, RefreshCcw, RotateCcw, ServerCog } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { CommandAuditTable } from './command-audit-table'
import { OpsAutoRefresh } from './ops-client-controls'
import { RuntimeDiagnosticsPanel } from './runtime-diagnostics-panel'

function relativeTime(timestamp: number, locale: WebLocale) {
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  if (!timestamp) return t('ops.relative.none')
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60_000) return t('ops.relative.seconds', { value: Math.max(1, Math.round(diff / 1000)) })
  if (diff < 3_600_000) return t('ops.relative.minutes', { value: Math.round(diff / 60_000) })
  if (diff < 86_400_000) return t('ops.relative.hours', { value: Math.round(diff / 3_600_000) })
  return t('ops.relative.days', { value: Math.round(diff / 86_400_000) })
}

export function DeveloperDiagnostics({ snapshot, instanceLabel, locale, csrfToken, canResetAudit }: {
  snapshot: OpsSnapshot
  instanceLabel: string
  locale: WebLocale
  csrfToken: string
  canResetAudit: boolean
}) {
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  return <div className="space-y-6">
    <section className="ops-panel p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ServerCog className="size-5 text-blue-400"/><h2 className="text-lg font-black text-white">{x('diagnostics.developerTitle')}</h2></div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">{x('diagnostics.developerText')}</p>
          <p className="mt-1 font-mono text-xs text-zinc-700">{instanceLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OpsAutoRefresh seconds={10}/>
          {canResetAudit ? <form action="/api/control" method="post">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <input type="hidden" name="action" value="reset_audit"/>
            <input type="hidden" name="instance" value={snapshot.instanceKey}/>
            <input type="hidden" name="section" value="diagnostics"/>
            <button className="ops-button-muted"><RotateCcw className="size-4"/>{t('ops.resetAudit')}</button>
          </form> : null}
        </div>
      </div>
    </section>

    <RuntimeDiagnosticsPanel instanceKey={snapshot.instanceKey} locale={locale}/>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4"><GitBranch className="size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">{t('ops.pipelineTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('ops.pipelineSubtitle', { instance: instanceLabel, count: snapshot.runtime.groupCount, time: relativeTime(snapshot.runtime.lastGroupSyncAt, locale) })}</p></div></div>
        <span className="ops-badge">{x('diagnostics.technical')}</span>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        {snapshot.stages.map((stage) => <article key={stage.id} className="ops-node">
          <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold tracking-wider text-blue-500">{t('ops.stage', { id: stage.id })}</span><span className={stage.status === 'optimal' ? 'ops-badge-good' : 'ops-badge-bad'}>{stage.status === 'optimal' ? t('ops.optimal') : t('ops.bottleneck')}</span></div>
          <h3 className="mt-4 font-bold text-zinc-100">{stage.name}</h3>
          <p className="mt-3 font-mono text-2xl font-black text-white">{stage.avgUs.toLocaleString(intl)} <span className="text-sm font-normal text-zinc-600">µs ({(stage.avgUs / 1000).toFixed(3)} ms)</span></p>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-600"><span>{t('ops.last', { value: stage.lastUs.toLocaleString(intl) })}</span><span>{t('ops.executions', { count: stage.invocations.toLocaleString(intl) })}</span></div>
        </article>)}
      </div>
    </section>

    <CommandAuditTable commands={snapshot.commands} locale={locale}/>

  </div>
}
