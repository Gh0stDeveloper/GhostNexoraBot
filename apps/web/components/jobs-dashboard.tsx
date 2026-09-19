import {
  Activity,
  Bot,
  BrainCircuit,
  Download,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  Send,
  Square,
  TerminalSquare,
  TriangleAlert,
} from 'lucide-react'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import type { WebOpsJobSnapshot, WebOpsJobStatus, WebOpsJobType } from '../lib/ops-jobs'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

function badge(status: WebOpsJobStatus) {
  if (status === 'running') return 'ops-badge-good'
  if (status === 'waiting') return 'ops-badge-warn'
  if (status === 'failed') return 'ops-badge-bad'
  return 'ops-badge'
}

function typeIcon(type: WebOpsJobType) {
  if (type === 'download') return Download
  if (type === 'yt-dlp' || type === 'ffmpeg') return TerminalSquare
  if (type === 'broadcast') return Send
  if (type === 'ai') return BrainCircuit
  if (type === 'update') return RefreshCcw
  return Activity
}

export function JobsDashboard({
  snapshot,
  instanceKey,
  instanceLabel,
  locale,
  csrfToken,
  canManage,
  filters,
}: {
  snapshot: WebOpsJobSnapshot
  instanceKey: string
  instanceLabel: string
  locale: WebLocale
  csrfToken: string
  canManage: boolean
  filters: { status: string; type: string; query: string }
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'

  const stats = [
    [Activity, x('jobs.active'), snapshot.counts.active],
    [ScrollText, x('jobs.waiting'), snapshot.counts.waiting],
    [Bot, x('jobs.running'), snapshot.counts.running],
    [RefreshCcw, x('jobs.completed'), snapshot.counts.completed],
    [TriangleAlert, x('jobs.failed'), snapshot.counts.failed],
    [Square, x('jobs.cancelled'), snapshot.counts.cancelled],
  ] as const

  const statusLabel = (status: WebOpsJobStatus) => x(
    status === 'waiting' ? 'jobs.waitingLabel'
      : status === 'running' ? 'jobs.runningLabel'
        : status === 'completed' ? 'jobs.completedLabel'
          : status === 'failed' ? 'jobs.failedLabel'
            : 'jobs.cancelledLabel',
  )

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-blue-400"/>
            <h2 className="text-lg font-black text-white">{x('jobs.title')}</h2>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{x('jobs.subtitle')} · {instanceLabel}</p>
        </div>
        <OpsAutoRefresh seconds={5}/>
      </div>

      <form method="get" className="grid gap-2 p-4 lg:grid-cols-[1fr_180px_180px_auto]">
        <input type="hidden" name="section" value="jobs"/>
        {instanceKey !== 'main' ? <input type="hidden" name="instance" value={instanceKey}/> : null}
        <input className="ops-input" name="jobQ" defaultValue={filters.query} placeholder={x('jobs.search')}/>
        <select className="ops-input" name="jobStatus" defaultValue={filters.status}>
          <option value="">{x('jobs.allStatuses')}</option>
          <option value="waiting">{x('jobs.waiting')}</option>
          <option value="running">{x('jobs.running')}</option>
          <option value="completed">{x('jobs.completed')}</option>
          <option value="failed">{x('jobs.failed')}</option>
          <option value="cancelled">{x('jobs.cancelled')}</option>
        </select>
        <select className="ops-input" name="jobType" defaultValue={filters.type}>
          <option value="">{x('jobs.allTypes')}</option>
          <option value="yt-dlp">yt-dlp</option>
          <option value="ffmpeg">FFmpeg</option>
          <option value="download">Download</option>
          <option value="broadcast">Broadcast</option>
          <option value="ai">AI</option>
          <option value="update">Update</option>
          <option value="other">Other</option>
        </select>
        <button className="ops-button-primary"><RefreshCcw className="size-4"/>{locale === 'es' ? 'Aplicar' : 'Apply'}</button>
      </form>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {stats.map(([Icon, label, value]) => <article key={label} className="ops-stat">
        <Icon className="size-4 text-blue-400"/>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
        <p className="mt-1 text-xl font-black text-white">{Number(value).toLocaleString(intl)}</p>
      </article>)}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-5 py-3 text-[10px] text-zinc-600">
        <span>{x('jobs.retention')}</span>
        <span>{x('jobs.capabilities')}</span>
      </div>

      {snapshot.rows.length ? <div className="max-h-[720px] overflow-auto">
        <table className="ops-table min-w-[1120px]">
          <thead><tr>
            <th>{x('jobs.status')}</th>
            <th>{x('jobs.type')}</th>
            <th>{x('jobs.job')}</th>
            <th>{x('jobs.progress')}</th>
            <th>{x('jobs.updated')}</th>
            <th>{x('jobs.actions')}</th>
          </tr></thead>
          <tbody>{snapshot.rows.map((row) => {
            const Icon = typeIcon(row.type)
            const canCancel = canManage && row.cancellable && (row.status === 'waiting' || row.status === 'running')
            const canRetry = canManage && row.retryable && (row.status === 'failed' || row.status === 'cancelled')
            return <tr key={row.id}>
              <td><span className={badge(row.status)}>{statusLabel(row.status)}</span></td>
              <td><span className="inline-flex items-center gap-2 font-mono text-xs text-zinc-400"><Icon className="size-3.5 text-blue-400"/>{row.type}</span></td>
              <td className="max-w-[420px]">
                <p className="truncate font-semibold text-zinc-200">{row.label}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{row.source} · {row.id}</p>
                {row.detail ? <p className="mt-1 truncate text-xs text-zinc-500">{row.detail}</p> : null}
                {row.error ? <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-red-300">{x('jobs.error')}</summary>
                  <p className="mt-2 max-w-xl break-words rounded-lg border border-red-500/10 bg-red-500/[.04] p-2 font-mono text-[11px] text-red-200/75">{row.error}</p>
                </details> : null}
              </td>
              <td className="min-w-44">
                <div className="flex items-center justify-between text-[10px] text-zinc-600"><span>{Math.round(row.progress)}%</span><span>{row.status}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}/></div>
              </td>
              <td className="whitespace-nowrap text-xs text-zinc-600">{new Date(row.updatedAt).toLocaleString(intl)}</td>
              <td>
                <div className="flex flex-wrap gap-2">
                  {canCancel ? <form action="/api/control" method="post">
                    <input type="hidden" name="_csrf" value={csrfToken}/>
                    <input type="hidden" name="instance" value={instanceKey}/>
                    <input type="hidden" name="section" value="jobs"/>
                    <input type="hidden" name="action" value="cancel_job"/>
                    <input type="hidden" name="jobId" value={row.id}/>
                    <ConfirmSubmitButton className="ops-button-danger" confirmText={locale === 'es' ? '¿Cancelar este job?' : 'Cancel this job?'}>
                      <Square className="size-3.5"/>{x('jobs.cancel')}
                    </ConfirmSubmitButton>
                  </form> : null}
                  {canRetry ? <form action="/api/control" method="post">
                    <input type="hidden" name="_csrf" value={csrfToken}/>
                    <input type="hidden" name="instance" value={instanceKey}/>
                    <input type="hidden" name="section" value="jobs"/>
                    <input type="hidden" name="action" value="retry_job"/>
                    <input type="hidden" name="jobId" value={row.id}/>
                    <button className="ops-button-muted"><RotateCcw className="size-3.5"/>{x('jobs.retry')}</button>
                  </form> : null}
                  {!canCancel && !canRetry ? <span className="text-xs text-zinc-700">—</span> : null}
                </div>
              </td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="grid min-h-48 place-items-center p-8 text-center">
        <div><Activity className="mx-auto size-7 text-zinc-700"/><p className="mt-3 text-sm text-zinc-600">{x('jobs.noRows')}</p></div>
      </div>}
    </section>
  </div>
}
