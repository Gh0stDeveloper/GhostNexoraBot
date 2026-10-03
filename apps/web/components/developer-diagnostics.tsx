import { Activity, AlertTriangle, GitBranch, Gauge, RefreshCcw, RotateCcw, ServerCog } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { CommandAuditTable } from './command-audit-table'
import { OpsAutoRefresh } from './ops-client-controls'
import { RuntimeDiagnosticsPanel } from './runtime-diagnostics-panel'
import {
  readAdapterMetrics,
  readErrorGroups,
  readPlatformRuntimeRegistry,
  readQueueMetrics,
} from '../lib/ops-observability'

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
  const platformRuntime = readPlatformRuntimeRegistry(snapshot.instanceKey)
  const queueMetrics = readQueueMetrics(snapshot.instanceKey, 80)
  const adapterMetrics = readAdapterMetrics(snapshot.instanceKey)
  const errorGroups = readErrorGroups(snapshot.instanceKey, 40)
  const labels = locale === 'es' ? {
    runtime: 'Runtime uniforme por plataforma', runtimeText: 'Estado, latencia, eventos, comunidades, reconexiones y rate limits publicados por cada adapter/runtime.',
    queues: 'Colas de ejecución', queuesText: 'Profundidad, espera, ejecución, fallos y saturación por plataforma, comando, provider y carril.',
    adapters: 'Métricas de adapters', adaptersText: 'Entregas, fallos, reintentos, uploads, latencia y errores de operaciones de plataforma.',
    errors: 'Errores agrupados', errorsText: 'Fingerprints sanitizados de fallos repetidos con primera/última aparición y correlation ID.',
    noData: 'Sin datos todavía', state: 'Estado', latency: 'Latencia', events: 'Eventos', groups: 'Comunidades', reconnects: 'Reconexiones', rateLimits: 'Rate limits',
    dimension: 'Dimensión', depth: 'Profundidad', wait: 'Espera', execution: 'Ejecución', failures: 'Fallos', sent: 'Enviados', retries: 'Reintentos', upload: 'Upload',
    occurrences: 'Apariciones', scope: 'Scope', first: 'Primera', last: 'Última', sample: 'Muestra sanitizada', correlation: 'Correlation ID',
  } : {
    runtime: 'Uniform platform runtime', runtimeText: 'State, latency, events, communities, reconnects, and rate limits published by each adapter/runtime.',
    queues: 'Execution queues', queuesText: 'Depth, wait, execution, failures, and saturation by platform, command, provider, and lane.',
    adapters: 'Adapter metrics', adaptersText: 'Deliveries, failures, retries, uploads, latency, and platform-operation errors.',
    errors: 'Grouped errors', errorsText: 'Sanitized fingerprints for repeated failures with first/last occurrence and correlation ID.',
    noData: 'No data yet', state: 'State', latency: 'Latency', events: 'Events', groups: 'Communities', reconnects: 'Reconnects', rateLimits: 'Rate limits',
    dimension: 'Dimension', depth: 'Depth', wait: 'Wait', execution: 'Execution', failures: 'Failures', sent: 'Sent', retries: 'Retries', upload: 'Upload',
    occurrences: 'Occurrences', scope: 'Scope', first: 'First', last: 'Last', sample: 'Sanitized sample', correlation: 'Correlation ID',
  }

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

    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-3"><Activity className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{labels.runtime}</h2><p className="mt-1 text-xs text-zinc-500">{labels.runtimeText}</p></div></div>
      </div>
      {platformRuntime.length ? <div className="grid gap-3 p-5 md:grid-cols-3">
        {platformRuntime.map((row) => <article key={row.platform} className="ops-node">
          <div className="flex items-center justify-between gap-3"><span className="font-bold capitalize text-zinc-100">{row.platform}</span><span className={row.state === 'running' ? 'ops-badge-good' : row.state === 'error' ? 'ops-badge-bad' : 'ops-badge-warn'}>{row.state.toUpperCase()}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500">
            <div><p>{labels.latency}</p><p className="mt-1 font-mono text-zinc-200">{row.latencyMs.toFixed(1)} ms</p></div>
            <div><p>{labels.events}</p><p className="mt-1 font-mono text-zinc-200">{row.eventCount.toLocaleString(intl)}</p></div>
            <div><p>{labels.groups}</p><p className="mt-1 font-mono text-zinc-200">{row.groupCount.toLocaleString(intl)}</p></div>
            <div><p>{labels.reconnects}</p><p className="mt-1 font-mono text-zinc-200">{row.reconnects.toLocaleString(intl)}</p></div>
            <div><p>{labels.rateLimits}</p><p className="mt-1 font-mono text-zinc-200">{row.rateLimits.toLocaleString(intl)}</p></div>
            <div><p>{labels.state}</p><p className="mt-1 font-mono text-zinc-200">{relativeTime(row.updatedAt, locale)}</p></div>
          </div>
          {row.lastError ? <p className="mt-4 rounded-lg border border-red-500/10 bg-red-500/[.04] p-3 text-xs text-red-300">{row.lastError}</p> : null}
        </article>)}
      </div> : <p className="p-5 text-sm text-zinc-600">{labels.noData}</p>}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-3"><Gauge className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{labels.queues}</h2><p className="mt-1 text-xs text-zinc-500">{labels.queuesText}</p></div></div>
      </div>
      {queueMetrics.length ? <div className="overflow-x-auto"><table className="ops-table min-w-[900px]"><thead><tr><th>{labels.dimension}</th><th>Platform</th><th>{labels.depth}</th><th>{labels.wait}</th><th>{labels.execution}</th><th>{labels.failures}</th><th>{labels.retries}</th></tr></thead><tbody>
        {queueMetrics.slice(0, 40).map((row) => <tr key={row.dimensionType + ':' + row.dimensionId + ':' + row.platform}><td><span className="font-mono text-xs text-blue-400">{row.dimensionType}</span><div className="mt-1 font-mono text-xs text-zinc-300">{row.dimensionId}</div></td><td className="capitalize">{row.platform}</td><td className="font-mono">{row.currentDepth} / max {row.maxDepth}</td><td className="font-mono">{row.lastWaitMs.toFixed(1)} ms</td><td className="font-mono">{row.lastExecutionMs.toFixed(1)} ms</td><td className="font-mono">{row.failures.toLocaleString(intl)}</td><td className="font-mono">{row.retries.toLocaleString(intl)}</td></tr>)}
      </tbody></table></div> : <p className="p-5 text-sm text-zinc-600">{labels.noData}</p>}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold text-white">{labels.adapters}</h2><p className="mt-1 text-xs text-zinc-500">{labels.adaptersText}</p></div>
      {adapterMetrics.length ? <div className="grid gap-3 p-5 md:grid-cols-3">
        {adapterMetrics.map((row) => <article key={row.platform} className="ops-node">
          <div className="flex items-center justify-between"><span className="font-bold capitalize">{row.platform}</span><span className={row.failed ? 'ops-badge-warn' : 'ops-badge-good'}>{row.failed ? row.failed + ' ' + labels.failures : 'OK'}</span></div>
          <div className="mt-4 space-y-2 text-xs text-zinc-500">
            <p>{labels.sent}: <span className="font-mono text-zinc-200">{row.sent.toLocaleString(intl)}</span></p>
            <p>{labels.retries}: <span className="font-mono text-zinc-200">{row.retries.toLocaleString(intl)}</span></p>
            <p>{labels.rateLimits}: <span className="font-mono text-zinc-200">{row.rateLimits.toLocaleString(intl)}</span></p>
            <p>{labels.latency}: <span className="font-mono text-zinc-200">{row.lastLatencyMs.toFixed(1)} ms</span></p>
            <p>{labels.upload}: <span className="font-mono text-zinc-200">{(row.uploadBytes / 1024 / 1024).toFixed(2)} MB</span></p>
          </div>
        </article>)}
      </div> : <p className="p-5 text-sm text-zinc-600">{labels.noData}</p>}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-3"><AlertTriangle className="size-5 text-amber-400"/><div><h2 className="font-bold text-white">{labels.errors}</h2><p className="mt-1 text-xs text-zinc-500">{labels.errorsText}</p></div></div>
      </div>
      {errorGroups.length ? <div className="overflow-x-auto"><table className="ops-table min-w-[1100px]"><thead><tr><th>Fingerprint</th><th>{labels.scope}</th><th>{labels.occurrences}</th><th>{labels.first}</th><th>{labels.last}</th><th>{labels.sample}</th><th>{labels.correlation}</th></tr></thead><tbody>
        {errorGroups.map((row) => <tr key={row.fingerprint}><td className="font-mono text-xs text-blue-400">{row.fingerprint}</td><td className="text-xs">{[row.platform, row.command, row.provider].filter(Boolean).join(' · ') || 'runtime'}</td><td className="font-mono">{row.count.toLocaleString(intl)}</td><td className="text-xs text-zinc-500">{row.firstSeenAt ? new Date(row.firstSeenAt).toLocaleString(intl) : '—'}</td><td className="text-xs text-zinc-500">{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString(intl) : '—'}</td><td className="max-w-96 text-xs text-zinc-400">{row.sample}</td><td className="font-mono text-[10px] text-zinc-600">{row.lastCorrelationId || '—'}</td></tr>)}
      </tbody></table></div> : <p className="p-5 text-sm text-zinc-600">{labels.noData}</p>}
    </section>

    <CommandAuditTable commands={snapshot.commands} locale={locale}/>

  </div>
}
