import {
  Activity,
  Bot,
  CircleAlert,
  Link2,
  MessageCircleMore,
  Play,
  RefreshCcw,
  ScrollText,
  Send,
  Server,
  Square,
  UsersRound,
} from 'lucide-react'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { readOpsRuntimeLogs } from '../lib/ops-observability'
import type { WebPlatformId, WebPlatformStatus } from '../lib/platform-status'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

function platformMeta(id: WebPlatformId, locale: WebLocale) {
  if (id === 'whatsapp') return { label: opsExtraT(locale, 'platformGroups.whatsapp'), Icon: MessageCircleMore }
  if (id === 'discord') return { label: opsExtraT(locale, 'platformGroups.discord'), Icon: Server }
  return { label: opsExtraT(locale, 'platformGroups.telegram'), Icon: Send }
}

function statusLabel(status: WebPlatformStatus, locale: WebLocale) {
  if (!status.known) return opsExtraT(locale, 'platformGroups.unknownStatus')
  if (status.enabled === false || status.state === 'disabled') return opsExtraT(locale, 'platforms.disabled')
  if (status.state === 'reconnecting') return opsExtraT(locale, 'platforms.reconnecting')
  if (status.state === 'starting') return opsExtraT(locale, 'platforms.starting')
  if (status.state === 'error') return opsExtraT(locale, 'platforms.error')
  if (status.state === 'blocked-webhook') return opsExtraT(locale, 'platforms.blockedWebhook')
  if (status.state === 'registered-no-heartbeat') return opsExtraT(locale, 'platforms.registeredNoHeartbeat')
  if (status.connected) return opsExtraT(locale, 'platforms.running')
  return opsExtraT(locale, 'platforms.stopped')
}

function statusClass(status: WebPlatformStatus) {
  if (status.connected) return 'ops-badge-good'
  if (status.state === 'starting' || status.state === 'reconnecting') return 'ops-badge-warn'
  if (!status.known || status.enabled === false) return 'ops-badge'
  return 'ops-badge-bad'
}

function maskAccount(status: WebPlatformStatus) {
  if (!status.accountLabel) return '—'
  if (status.id !== 'whatsapp') return status.accountLabel
  const raw = status.accountLabel.split('@')[0]?.split(':')[0] ?? ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 6) return '••••'
  return `${digits.slice(0, 2)}••••••${digits.slice(-4)}`
}

function date(value: string | null, locale: WebLocale) {
  if (!value) return '—'
  const stamp = Date.parse(value)
  if (!Number.isFinite(stamp)) return '—'
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(stamp))
}

function bool(value: boolean | null, locale: WebLocale) {
  if (value === null) return opsExtraT(locale, 'platforms.unknown')
  return value ? opsExtraT(locale, 'platforms.yes') : opsExtraT(locale, 'platforms.no')
}

function number(value: number | null, locale: WebLocale) {
  return value === null
    ? opsExtraT(locale, 'platforms.unknown')
    : value.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US')
}

function href(baseHref: string, key: 'focus' | 'logs', value: WebPlatformId) {
  const url = new URL(baseHref, 'https://ghost-nexora.local')
  url.searchParams.set(key, value)
  return url.pathname + url.search
}

function platformLogMatch(id: WebPlatformId, source: string, message: string) {
  const src = source.toLowerCase()
  const msg = message.toLowerCase()
  if (id === 'whatsapp') {
    return src.includes('whatsapp') || src === 'groups' || src === 'group-control' || msg.includes('whatsapp')
  }
  return src.includes(id) || msg.includes(id)
}

function PlatformActions({ status, csrfToken, canOperate, canDisable, mainRuntimeActions, locale }: {
  status: WebPlatformStatus
  csrfToken: string
  canOperate: boolean
  canDisable: boolean
  mainRuntimeActions: boolean
  locale: WebLocale
}) {
  if (!mainRuntimeActions) {
    return <span className="text-xs text-zinc-600">{opsExtraT(locale, 'platforms.mainOnly')}</span>
  }

  if (!canOperate && !canDisable) {
    return <span className="text-xs text-zinc-600">{opsExtraT(locale, 'platforms.readOnly')}</span>
  }

  return <div className="flex flex-wrap gap-2">
    {canOperate && status.enabled !== false && !status.connected ? <form action="/api/platforms" method="post">
      <input type="hidden" name="_csrf" value={csrfToken}/>
      <input type="hidden" name="platform" value={status.id}/>
      <input type="hidden" name="action" value="connect"/>
      <button className="ops-button-primary"><Play className="size-4"/>{opsExtraT(locale, 'platforms.connect')}</button>
    </form> : null}

    {canOperate && status.enabled !== false ? <form action="/api/platforms" method="post">
      <input type="hidden" name="_csrf" value={csrfToken}/>
      <input type="hidden" name="platform" value={status.id}/>
      <input type="hidden" name="action" value="restart"/>
      <button className="ops-button-muted"><RefreshCcw className="size-4"/>{opsExtraT(locale, 'platforms.restart')}</button>
    </form> : null}

    {canDisable && status.connected ? <form action="/api/platforms" method="post">
      <input type="hidden" name="_csrf" value={csrfToken}/>
      <input type="hidden" name="platform" value={status.id}/>
      <input type="hidden" name="action" value="disconnect"/>
      <ConfirmSubmitButton
        className="ops-button-danger"
        confirmText={opsExtraT(locale, 'platforms.disconnectConfirm').replace('{platform}', platformMeta(status.id, locale).label)}
      >
        <Square className="size-4"/>{opsExtraT(locale, 'platforms.disconnect')}
      </ConfirmSubmitButton>
    </form> : null}
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[.06] bg-black/20 px-3 py-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
    <p className="mt-1.5 truncate text-sm font-semibold text-zinc-200">{value}</p>
  </div>
}

function platformMetrics(status: WebPlatformStatus, locale: WebLocale) {
  const m = status.metrics
  if (status.id === 'whatsapp') {
    return [
      [opsExtraT(locale, 'platforms.whatsappGroups'), number(m.groups, locale)],
      [opsExtraT(locale, 'platforms.messagesPerMinute'), number(m.messagesPerMinute, locale)],
      [opsExtraT(locale, 'platforms.reconnects'), number(m.reconnects, locale)],
      [opsExtraT(locale, 'platforms.lastActivity'), date(m.lastActivityAt, locale)],
    ] as const
  }

  if (status.id === 'discord') {
    return [
      [opsExtraT(locale, 'platforms.discordGuilds'), number(m.groups, locale)],
      [opsExtraT(locale, 'platforms.events'), number(m.eventsProcessed, locale)],
      [opsExtraT(locale, 'platforms.sequence'), number(m.sequence, locale)],
      [opsExtraT(locale, 'platforms.reconnects'), number(m.reconnects, locale)],
    ] as const
  }

  return [
    [opsExtraT(locale, 'platforms.telegramGroups'), number(m.groups, locale)],
    [opsExtraT(locale, 'platforms.telegramUpdates'), number(m.updatesProcessed, locale)],
    [opsExtraT(locale, 'platforms.offset'), number(m.offset, locale)],
    [opsExtraT(locale, 'platforms.reconnects'), number(m.reconnects, locale)],
  ] as const
}

function DiagnosticDetails({ status, locale }: { status: WebPlatformStatus; locale: WebLocale }) {
  const m = status.metrics
  const common = [
    [opsExtraT(locale, 'platforms.status'), statusLabel(status, locale)],
    [opsExtraT(locale, 'platforms.account'), maskAccount(status)],
    [opsExtraT(locale, 'platforms.configured'), bool(status.enabled, locale)],
    [opsExtraT(locale, 'platforms.startedAt'), date(m.startedAt, locale)],
    [opsExtraT(locale, 'platforms.lastActivity'), date(m.lastActivityAt, locale)],
    [opsExtraT(locale, 'platforms.reconnects'), number(m.reconnects, locale)],
  ]

  const extra = status.id === 'discord'
    ? [
      [opsExtraT(locale, 'platforms.readyAt'), date(m.readyAt, locale)],
      [opsExtraT(locale, 'platforms.sequence'), number(m.sequence, locale)],
      [opsExtraT(locale, 'platforms.sessionResume'), bool(m.sessionResumable, locale)],
      [opsExtraT(locale, 'platforms.commandSyncEnabled'), bool(m.commandRegistrationEnabled, locale)],
      [opsExtraT(locale, 'platforms.commandScope'), m.commandScope ?? opsExtraT(locale, 'platforms.unknown')],
      [opsExtraT(locale, 'platforms.commandSyncAt'), date(m.commandSyncAt, locale)],
    ]
    : status.id === 'telegram'
      ? [
        [opsExtraT(locale, 'platforms.offset'), number(m.offset, locale)],
        [opsExtraT(locale, 'platforms.webhook'), bool(m.webhookConfigured, locale)],
        [opsExtraT(locale, 'platforms.bridge'), bool(m.bridgeChannelConfigured, locale)],
      ]
      : [
        [opsExtraT(locale, 'platforms.messagesPerMinute'), number(m.messagesPerMinute, locale)],
        [opsExtraT(locale, 'platforms.events'), number(m.eventsProcessed, locale)],
      ]

  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {[...common, ...extra].map(([label, value]) => <Metric key={label} label={label} value={value}/>)}
  </div>
}

export function PlatformsDashboard({ instanceKey, instanceLabel, statuses, locale, csrfToken, canOperate, canDisable, mainRuntimeActions, baseHref, focus, logs }: {
  instanceKey: string
  instanceLabel: string
  statuses: WebPlatformStatus[]
  locale: WebLocale
  csrfToken: string
  canOperate: boolean
  canDisable: boolean
  mainRuntimeActions: boolean
  baseHref: string
  focus?: WebPlatformId | null
  logs?: WebPlatformId | null
}) {
  const connected = statuses.filter((item) => item.connected).length
  const runtimeLogs = logs
    ? readOpsRuntimeLogs(instanceKey, 160).filter((row) => platformLogMatch(logs, row.source, row.message)).slice(0, 60)
    : []
  const focused = focus ? statuses.find((item) => item.id === focus) ?? null : null
  const intl = locale === 'es' ? 'es-MX' : 'en-US'

  return <div className="space-y-6">
    <section className="ops-panel p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Activity className="size-5 text-blue-400"/><h2 className="text-lg font-black text-white">{opsExtraT(locale, 'platforms.title')}</h2></div>
          <p className="mt-2 text-sm text-zinc-500">{opsExtraT(locale, 'platforms.subtitle')}</p>
          <p className="mt-1 text-xs text-zinc-700">{instanceLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="ops-badge-good">{connected}/{statuses.length}</span>
          <OpsAutoRefresh seconds={10}/>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-3">
      {statuses.map((status) => {
        const { label, Icon } = platformMeta(status.id, locale)
        const metrics = platformMetrics(status, locale)
        return <section key={status.id} className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.03]"><Icon className="size-5 text-blue-400"/></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-white">{label}</h3>
                  <span className={statusClass(status)}>{statusLabel(status, locale)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-600">{maskAccount(status)}</p>
              </div>
            </div>
            {status.detail ? <div className="mt-3 flex gap-2 rounded-xl border border-red-500/15 bg-red-500/[.05] p-3 text-xs leading-5 text-red-300"><CircleAlert className="mt-0.5 size-4 shrink-0"/><span className="break-words">{status.detail}</span></div> : null}
          </div>

          <div className="grid grid-cols-2 gap-2 p-5">
            {metrics.map(([metric, value]) => <Metric key={metric} label={metric} value={value}/>)}
          </div>

          <div className="border-t border-white/[.07] p-5">
            <div className="flex flex-wrap gap-2">
              <a className="ops-button-muted" href={href(baseHref, 'focus', status.id)}><Activity className="size-4"/>{opsExtraT(locale, 'platforms.diagnose')}</a>
              <a className="ops-button-muted" href={href(baseHref, 'logs', status.id)}><ScrollText className="size-4"/>{opsExtraT(locale, 'platforms.logs')}</a>
            </div>
            <div className="mt-3">
              <PlatformActions
                status={status}
                csrfToken={csrfToken}
                canOperate={canOperate}
                canDisable={canDisable}
                mainRuntimeActions={mainRuntimeActions}
                locale={locale}
              />
            </div>
          </div>
        </section>
      })}
    </div>

    {focused ? <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] p-5">
        <div className="flex items-center gap-3"><Bot className="size-5 text-blue-400"/><div><h3 className="font-bold text-white">{opsExtraT(locale, 'platforms.diagnosticTitle').replace('{platform}', platformMeta(focused.id, locale).label)}</h3><p className="mt-1 text-xs text-zinc-500">{opsExtraT(locale, 'platforms.diagnosticText')}</p></div></div>
      </div>
      <div className="p-5">
        <DiagnosticDetails status={focused} locale={locale}/>
        <div className="mt-4 rounded-xl border border-white/[.06] bg-black/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{opsExtraT(locale, 'platforms.lastError')}</p>
          <p className={focused.detail || focused.metrics.commandSyncError ? 'mt-2 break-words text-sm text-red-300' : 'mt-2 text-sm text-emerald-300'}>
            {focused.detail || focused.metrics.commandSyncError || opsExtraT(locale, 'platforms.noError')}
          </p>
        </div>
      </div>
    </section> : null}

    {logs ? <section className="ops-panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/[.08] p-5">
        <ScrollText className="size-5 text-blue-400"/>
        <div><h3 className="font-bold text-white">{opsExtraT(locale, 'platforms.logsTitle').replace('{platform}', platformMeta(logs, locale).label)}</h3><p className="mt-1 text-xs text-zinc-500">{opsExtraT(locale, 'platforms.logsText')}</p></div>
        <span className="ml-auto font-mono text-xs text-zinc-600">{runtimeLogs.length}</span>
      </div>
      {runtimeLogs.length ? <div className="max-h-[520px] overflow-auto">
        <table className="ops-table min-w-[820px]">
          <thead><tr><th>{opsExtraT(locale, 'logs.level')}</th><th>{opsExtraT(locale, 'logs.source')}</th><th>{opsExtraT(locale, 'logs.message')}</th><th>{opsExtraT(locale, 'logs.date')}</th></tr></thead>
          <tbody>{runtimeLogs.map((row) => <tr key={row.id}>
            <td><span className={row.level === 'error' ? 'ops-badge-bad' : row.level === 'warn' ? 'ops-badge-warn' : row.level === 'info' ? 'ops-badge-good' : 'ops-badge'}>{row.level.toUpperCase()}</span></td>
            <td className="font-mono text-xs text-blue-300/70">{row.source}</td>
            <td className="max-w-[560px] break-words font-mono text-xs text-zinc-400">{row.message}</td>
            <td className="whitespace-nowrap text-xs text-zinc-600">{new Date(row.createdAt).toLocaleString(intl)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="px-5 py-8 text-center text-sm text-zinc-600">{opsExtraT(locale, 'platforms.noLogs')}</div>}
    </section> : null}

    {!mainRuntimeActions ? <div className="rounded-xl border border-amber-500/15 bg-amber-500/[.05] px-4 py-3 text-xs text-amber-200">
      <Link2 className="mr-2 inline size-4"/>{opsExtraT(locale, 'platforms.mainOnly')}
    </div> : null}
  </div>
}
