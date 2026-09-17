import { Activity, Gauge, GitBranch, RefreshCcw, RotateCcw, ServerCog, ShieldAlert, Signal, UsersRound } from 'lucide-react'
import type { OpsProviderHealth, OpsSnapshot } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { CommandAuditTable } from './command-audit-table'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

export type OpsConsoleView = 'overview' | 'groups' | 'audit'

function latency(us: number, intl: string) {
  if (!us) return '0 µs'
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`
  return `${Math.round(us).toLocaleString(intl)} µs`
}

function latencyMs(ms: number, intl: string) {
  if (!ms) return '0 ms'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${Math.round(ms).toLocaleString(intl)} ms`
}

function relativeTime(timestamp: number, locale: WebLocale) {
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  if (!timestamp) return t('ops.relative.none')
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60_000) return t('ops.relative.seconds', { value: Math.max(1, Math.round(diff / 1000)) })
  if (diff < 3_600_000) return t('ops.relative.minutes', { value: Math.round(diff / 60_000) })
  if (diff < 86_400_000) return t('ops.relative.hours', { value: Math.round(diff / 3_600_000) })
  return t('ops.relative.days', { value: Math.round(diff / 86_400_000) })
}

function dateTime(timestamp: number, locale: WebLocale) {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function providerBadge(provider: OpsProviderHealth, locale: WebLocale) {
  const className = provider.status === 'online'
    ? 'ops-badge-good'
    : provider.status === 'degraded' || provider.status === 'unknown'
      ? 'ops-badge-warn'
      : 'ops-badge-bad'
  const key = `provider.status.${provider.status}` as const
  return <span className={className}>{opsExtraT(locale, key)}</span>
}

export function OpsConsole({ snapshot, refreshHref, instanceLabel, view = 'overview', locale }: {
  snapshot: OpsSnapshot
  refreshHref: string
  instanceLabel: string
  view?: OpsConsoleView
  locale: WebLocale
}) {
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  if (view === 'groups') {
    return <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><UsersRound className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{t('ops.groupsTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('ops.groupsText', { count: snapshot.groups.length, instance: instanceLabel })}</p></div></div>
        <div className="flex flex-wrap gap-2"><OpsAutoRefresh seconds={10}/><form action="/api/control" method="post"><input type="hidden" name="action" value="sync_groups"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><button className="ops-button-muted"><RefreshCcw className="size-4"/>{t('ops.syncGroups')}</button></form></div>
      </div>
      <div className="overflow-x-auto">
        <table className="ops-table min-w-[1020px]">
          <thead><tr><th>{t('ops.table.group')}</th><th>{t('ops.table.members')}</th><th>{t('ops.table.admins')}</th><th>{t('ops.table.mode')}</th><th>{t('ops.table.updated')}</th><th className="text-right">{t('ops.table.action')}</th></tr></thead>
          <tbody>
            {snapshot.groups.length ? snapshot.groups.map((group) => {
              const muted = group.mutedUntil > Date.now()
              return <tr key={group.groupJid}>
                <td><p className="font-semibold text-zinc-100">{group.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-700">{group.groupJid}</p></td>
                <td className="font-mono">{group.participantCount.toLocaleString(intl)}</td>
                <td className="font-mono">{group.adminCount.toLocaleString(intl)}</td>
                <td>
                  <div className="flex flex-col items-start gap-1.5">
                    <span className={group.announce ? 'ops-badge-warn' : 'ops-badge-good'}>{group.announce ? t('ops.onlyAdmins') : t('ops.openMode')}</span>
                    {muted && <><span className="ops-badge-warn">{x('group.muted')}</span><span className="text-[10px] text-zinc-600">{x('group.until')} {dateTime(group.mutedUntil, locale)}</span></>}
                  </div>
                </td>
                <td className="text-zinc-500">{relativeTime(group.updatedAt, locale)}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {muted ? <form action="/api/control" method="post">
                      <input type="hidden" name="action" value="unmute_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                      <button className="ops-button-muted text-xs">{x('group.unmute')}</button>
                    </form> : <>
                      <form action="/api/control" method="post">
                        <input type="hidden" name="action" value="mute_group_8h"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                        <button className="ops-button-muted text-xs">{x('group.mute8h')}</button>
                      </form>
                      <form action="/api/control" method="post">
                        <input type="hidden" name="action" value="mute_group_7d"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                        <button className="ops-button-muted text-xs">{x('group.mute7d')}</button>
                      </form>
                    </>}
                    <form action="/api/control" method="post"><input type="hidden" name="action" value="leave_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/><ConfirmSubmitButton className="ops-button-danger" confirmText={t('ops.leaveConfirm', { instance: instanceLabel, group: group.name })}>{t('ops.leave')}</ConfirmSubmitButton></form>
                  </div>
                </td>
              </tr>
            }) : <tr><td colSpan={6} className="py-10 text-center text-zinc-500">{t('ops.noGroups')}</td></tr>}
          </tbody>
        </table>
      </div>
      {snapshot.requests.length > 0 && <div className="border-t border-white/[.08] px-5 py-4 text-xs text-zinc-600">{t('ops.lastOperation', { action: snapshot.requests[0].action, status: snapshot.requests[0].status, error: snapshot.requests[0].error ? ` · ${snapshot.requests[0].error}` : '' })}</div>}
    </section>
  }

  if (view === 'audit') {
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-zinc-500">{t('ops.auditText', { instance: instanceLabel })}</p></div>
        <div className="flex gap-2"><OpsAutoRefresh seconds={10}/><form action="/api/control" method="post"><input type="hidden" name="action" value="reset_audit"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="audit"/><button className="ops-button-muted"><RotateCcw className="size-4"/>{t('ops.resetAudit')}</button></form></div>
      </div>
      <CommandAuditTable commands={snapshot.commands} locale={locale} />
    </div>
  }

  const stats = [
    { icon: Signal, label: 'WhatsApp', value: snapshot.runtime.connected ? t('ops.connected') : snapshot.runtime.registered ? t('ops.noHeartbeat') : t('ops.notLinked'), note: snapshot.runtime.fresh ? t('ops.heartbeat', { value: relativeTime(snapshot.runtime.updatedAt, locale) }) : t('ops.noRecentHeartbeat'), danger: !snapshot.runtime.connected },
    { icon: Activity, label: 'Throughput', value: `${snapshot.summary.throughputMps.toFixed(2)} MPS`, note: t('ops.messagesPerSecond') },
    { icon: Gauge, label: 'E2E', value: latency(snapshot.summary.averageE2eUs, intl), note: t('ops.instrumented', { value: snapshot.summary.averageE2eUs.toLocaleString(intl) }) },
    { icon: GitBranch, label: 'Pipeline', value: `${snapshot.summary.processingNodes} / 7`, note: t('ops.stagesInstrumented') },
    { icon: ServerCog, label: t('admin.table.messages'), value: snapshot.summary.auditedCommands.toLocaleString(intl), note: t('ops.pluginsRegistered') },
    { icon: ShieldAlert, label: t('ops.bottlenecks'), value: snapshot.summary.bottlenecks.toLocaleString(intl), note: t('ops.slowCritical'), danger: snapshot.summary.bottlenecks > 0 },
  ]

  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map(({ icon: Icon, label, value, note, danger }) => <article key={label} className="ops-stat">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-zinc-500">{label}</p><Icon className={`size-4 ${label === 'WhatsApp' && snapshot.runtime.connected ? 'text-emerald-500' : 'text-zinc-700'}`} /></div>
        <p className={`mt-3 text-xl font-black tracking-tight ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
        <p className="mt-1 text-xs text-zinc-600">{note}</p>
      </article>)}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4"><GitBranch className="size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">{t('ops.pipelineTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('ops.pipelineSubtitle', { instance: instanceLabel, count: snapshot.runtime.groupCount, time: relativeTime(snapshot.runtime.lastGroupSyncAt, locale) })}</p></div></div>
        <div className="flex flex-wrap gap-2"><OpsAutoRefresh seconds={10}/><a href={refreshHref} className="ops-button-muted"><RefreshCcw className="size-4"/>{t('common.refresh')}</a></div>
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
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4"><Activity className="size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">{x('provider.title')}</h2><p className="mt-1 text-xs text-zinc-500">{x('provider.subtitle')}</p></div></div>
        <div className="flex items-center gap-2"><span className="font-mono text-xs text-zinc-600">{snapshot.providers.length.toLocaleString(intl)}</span><OpsAutoRefresh seconds={10}/></div>
      </div>
      {snapshot.providers.length ? <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.providers.map((provider) => <article key={provider.providerId} className="ops-node">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-bold text-zinc-100">{provider.label}</p><p className="mt-1 font-mono text-[10px] text-zinc-700">{provider.providerId}</p></div>
            {providerBadge(provider, locale)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block text-zinc-600">{x('provider.avg')}</span><strong className="mt-1 block font-mono text-zinc-200">{latencyMs(provider.averageLatencyMs, intl)}</strong></div>
            <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block text-zinc-600">{x('provider.last')}</span><strong className="mt-1 block font-mono text-zinc-200">{latencyMs(provider.lastLatencyMs, intl)}</strong></div>
            <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block text-zinc-600">{x('provider.errors')}</span><strong className="mt-1 block font-mono text-zinc-200">{provider.errorRate.toFixed(1)}%</strong></div>
            <div className="rounded-lg border border-white/[.06] bg-black/20 p-3"><span className="block text-zinc-600">{x('provider.requests')}</span><strong className="mt-1 block font-mono text-zinc-200">{provider.requests.toLocaleString(intl)}</strong></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-zinc-600"><span>{x('provider.lastFailure')}</span><span className="text-right">{provider.lastFailureAt ? relativeTime(provider.lastFailureAt, locale) : x('provider.noFailure')}</span></div>
          {provider.lastError && <p className="mt-2 truncate rounded-md border border-red-500/10 bg-red-500/[.04] px-2 py-1.5 font-mono text-[10px] text-red-400/70" title={provider.lastError}>{provider.lastError}</p>}
        </article>)}
      </div> : <div className="px-5 py-10 text-center text-sm text-zinc-600">{x('provider.empty')}</div>}
    </section>
  </div>
}
