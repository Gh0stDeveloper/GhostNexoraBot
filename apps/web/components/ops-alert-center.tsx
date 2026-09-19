import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { readOpsAlerts, type WebOpsAlert } from '../lib/ops-observability'
import type { WebLocale } from '../lib/i18n'
import type { OpsRuntimeStatus } from '../lib/ops'

function alertClass(alert: WebOpsAlert) {
  if (alert.status === 'resolved') return 'ops-badge-good'
  if (alert.severity === 'critical') return 'ops-badge-bad'
  return 'ops-badge-warn'
}

function severityLabel(locale: WebLocale, alert: WebOpsAlert) {
  if (alert.status === 'resolved') return opsExtraT(locale, 'alerts.resolved')
  if (alert.severity === 'critical') return opsExtraT(locale, 'alerts.critical')
  if (alert.severity === 'warning') return opsExtraT(locale, 'alerts.warning')
  return opsExtraT(locale, 'alerts.info')
}

export function OpsAlertCenter({ instanceKey, runtime, locale }: {
  instanceKey: string
  runtime: OpsRuntimeStatus
  locale: WebLocale
}) {
  const persisted = readOpsAlerts(instanceKey, 20)
  const alerts: WebOpsAlert[] = [...persisted]
  const staleExpectedRuntime = runtime.reportedConnected && runtime.updatedAt > 0 && !runtime.fresh
  if (staleExpectedRuntime) {
    const staleDetectedAt = runtime.updatedAt + 180_000
    alerts.unshift({
      key: 'runtime:stale-web',
      severity: 'critical',
      title: opsExtraT(locale, 'alerts.runtimeStaleTitle'),
      detail: opsExtraT(locale, 'alerts.runtimeStaleDetail'),
      status: 'open',
      openedAt: staleDetectedAt,
      updatedAt: staleDetectedAt,
      resolvedAt: null,
      occurrences: 1,
    })
  }
  const open = alerts.filter((item) => item.status === 'open')
  const rows = open.length ? open : alerts.filter((item) => item.status === 'resolved').slice(0, 3)

  return <section className="ops-panel overflow-hidden">
    <div className="flex items-center gap-3 border-b border-white/[.08] px-5 py-5">
      <BellRing className="size-5 text-amber-400"/>
      <div><h2 className="font-bold text-white">{opsExtraT(locale, 'alerts.title')}</h2><p className="mt-1 text-xs text-zinc-500">{opsExtraT(locale, 'alerts.text')}</p></div>
      <span className={open.length ? 'ops-badge-warn ml-auto' : 'ops-badge-good ml-auto'}>{open.length}</span>
    </div>
    {rows.length ? <div className="grid gap-3 p-5 lg:grid-cols-2">
      {rows.map((alert) => <article key={alert.key} className="ops-node">
        <div className="flex items-start gap-3">
          {alert.status === 'resolved' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400"/> : <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${alert.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}/>} 
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-zinc-100">{alert.title}</p><span className={alertClass(alert)}>{severityLabel(locale, alert)}</span></div>{alert.detail && <p className="mt-2 text-xs leading-5 text-zinc-500">{alert.detail}</p>}<p className="mt-3 font-mono text-[10px] text-zinc-700">{opsExtraT(locale, 'alerts.occurrences').replace('{count}', String(alert.occurrences))} · {new Date(alert.updatedAt).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US')}</p></div>
        </div>
      </article>)}
    </div> : <div className="px-5 py-8 text-center text-sm text-zinc-600">{opsExtraT(locale, 'alerts.none')}</div>}
  </section>
}
