import {
  AlertTriangle,
  Check,
  Circle,
  GitBranch,
  GitCommitHorizontal,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { UPDATE_STAGES, type UpdateDashboardSnapshot, type UpdateStage } from '../lib/update-dashboard'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

function shortSha(value: string | null) {
  if (!value || value === 'unknown') return value || '—'
  return value.slice(0, 12)
}

export function UpdateDashboard({
  snapshot,
  locale,
  csrfToken,
  canManage,
}: {
  snapshot: UpdateDashboardSnapshot
  locale: WebLocale
  csrfToken: string
  canManage: boolean
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  const status = snapshot.status
  const latestJobIsNewer = Boolean(snapshot.job && (!status.updatedAt || snapshot.job.updatedAt > status.updatedAt))
  const effectiveStatus = latestJobIsNewer ? snapshot.job!.status : status.status
  const effectiveProgress = latestJobIsNewer ? snapshot.job!.progress : status.progress
  const effectiveStage: UpdateStage = latestJobIsNewer ? 'fetch' : status.stage
  const active = effectiveStatus === 'waiting' || effectiveStatus === 'running'
  const currentIndex = UPDATE_STAGES.indexOf(effectiveStage)

  const stageState = (stage: UpdateStage) => {
    const index = UPDATE_STAGES.indexOf(stage)
    if (effectiveStatus === 'completed') return 'completed'
    if (effectiveStatus === 'failed') return index < currentIndex ? 'completed' : index === currentIndex ? 'failed' : 'pending'
    if (active) return index < currentIndex ? 'completed' : index === currentIndex ? 'running' : 'pending'
    return 'pending'
  }

  const stateIcon = (state: string) => {
    if (state === 'completed') return Check
    if (state === 'failed') return XCircle
    if (state === 'running') return RefreshCcw
    return Circle
  }

  const stateLabel = (state: string) => x(
    state === 'completed' ? 'update.stage.completed'
      : state === 'failed' ? 'update.stage.failed'
        : state === 'running' ? 'update.stage.running'
          : 'update.stage.pending',
  )

  const statusLabel = effectiveStatus === 'completed'
    ? x('update.completed')
    : effectiveStatus === 'failed'
      ? x('update.failed')
      : active
        ? x('update.running')
        : x('update.idle')

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Rocket className="size-5 text-blue-400"/>
            <h2 className="text-lg font-black text-white">{x('update.title')}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{x('update.subtitle')}</p>
        </div>
        <OpsAutoRefresh seconds={5}/>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <article className="ops-stat">
          <ShieldCheck className="size-4 text-blue-400"/>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('update.installedVersion')}</p>
          <p className="mt-1 font-mono text-lg font-black text-white">{snapshot.installedVersion}</p>
        </article>
        <article className="ops-stat">
          <GitCommitHorizontal className="size-4 text-blue-400"/>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('update.currentCommit')}</p>
          <p className="mt-1 font-mono text-sm font-black text-white">{shortSha(snapshot.currentCommit)}</p>
        </article>
        <article className="ops-stat">
          <GitBranch className="size-4 text-blue-400"/>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('update.branch')}</p>
          <p className="mt-1 font-mono text-sm font-black text-white">{snapshot.branch}</p>
        </article>
        <article className="ops-stat">
          <RefreshCcw className="size-4 text-blue-400"/>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('update.latestVersion')}</p>
          <p className="mt-1 font-mono text-lg font-black text-white">{snapshot.latestVersion ?? '—'}</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">{shortSha(snapshot.latestCommit)}</p>
        </article>
        <article className="ops-stat">
          <TerminalSquare className="size-4 text-blue-400"/>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('update.status')}</p>
          <span className={snapshot.updateAvailable === true ? 'ops-badge-warn mt-2' : snapshot.updateAvailable === false ? 'ops-badge-good mt-2' : 'ops-badge mt-2'}>
            {snapshot.updateAvailable === true ? x('update.available') : snapshot.updateAvailable === false ? x('update.upToDate') : x('update.remoteUnknown')}
          </span>
        </article>
      </div>
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <RefreshCcw className={active ? 'size-4 animate-spin text-blue-400' : 'size-4 text-blue-400'}/>
            <h3 className="font-bold text-white">{statusLabel}</h3>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {status.message ?? snapshot.job?.detail ?? x('update.idle')}
          </p>
          <p className="mt-2 font-mono text-[10px] text-zinc-700">
            {snapshot.job ? `${x('update.job')}: ${snapshot.job.id}` : ''}
            {status.updatedAt ? ` · ${x('update.lastUpdate')}: ${new Date(status.updatedAt).toLocaleString(intl)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={snapshot.triggerInstalled ? 'ops-badge-good' : 'ops-badge-bad'}>
            {snapshot.triggerInstalled ? x('update.triggerReady') : x('update.triggerMissing')}
          </span>
          {canManage ? <form action="/api/control" method="post">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <input type="hidden" name="section" value="updates"/>
            <input type="hidden" name="instance" value="main"/>
            <input type="hidden" name="action" value="request_update"/>
            <ConfirmSubmitButton
              className="ops-button-primary"
              disabled={active || !snapshot.triggerInstalled}
              confirmText={x('update.startConfirm')}
            >
              <Rocket className="size-4"/>{active ? x('update.running') : x('update.start')}
            </ConfirmSubmitButton>
          </form> : null}
        </div>
      </div>

      {!snapshot.triggerInstalled ? <div className="border-b border-amber-500/10 bg-amber-500/[.04] px-5 py-3 text-xs text-amber-200/80">{x('update.triggerHint')}</div> : null}

      <div className="p-5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-600">
          <span>{x('update.progress')}</span>
          <span>{Math.round(effectiveProgress)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[.05]">
          <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${effectiveProgress}%` }}/>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {UPDATE_STAGES.map((stage) => {
            const state = stageState(stage)
            const Icon = stateIcon(state)
            const key = `update.stage.${stage}` as Parameters<typeof opsExtraT>[1]
            return <article key={stage} className={state === 'running' ? 'ops-node border-blue-500/20 bg-blue-500/[.05]' : state === 'failed' ? 'ops-node border-red-500/20 bg-red-500/[.04]' : 'ops-node'}>
              <div className="flex items-center gap-2">
                <Icon className={state === 'completed' ? 'size-4 text-emerald-400' : state === 'failed' ? 'size-4 text-red-400' : state === 'running' ? 'size-4 animate-spin text-blue-400' : 'size-4 text-zinc-700'}/>
                <span className="text-xs font-bold text-zinc-300">{x(key)}</span>
              </div>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{stateLabel(state)}</p>
            </article>
          })}
        </div>
      </div>

      {status.error ? <div className="border-t border-red-500/15 bg-red-500/[.04] p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-red-300"><AlertTriangle className="size-4"/>{x('update.errorReal')}</div>
        <p className="mt-1 text-xs text-red-200/60">{x('update.errorOwner')}</p>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-red-500/10 bg-black/20 p-3 font-mono text-[11px] leading-5 text-red-100/80">{status.error}</pre>
      </div> : null}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-4">
        <h3 className="font-bold text-white">{x('update.changelog')}</h3>
        <p className="mt-1 font-mono text-[10px] text-zinc-600">{shortSha(snapshot.currentCommit)} → {shortSha(snapshot.latestCommit)}</p>
      </div>
      {snapshot.changelog.length ? <div className="divide-y divide-white/[.05]">
        {snapshot.changelog.map((message, index) => <div key={`${index}-${message}`} className="flex gap-3 px-5 py-3">
          <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-blue-400"/>
          <p className="text-xs leading-5 text-zinc-400">{message}</p>
        </div>)}
      </div> : <div className="p-8 text-center text-sm text-zinc-600">{x('update.noChanges')}</div>}
    </section>
  </div>
}
