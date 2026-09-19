import { MessageCircleMore, RefreshCcw, Send, Server, ShieldCheck, UsersRound } from 'lucide-react'
import type { OpsPlatformGroup, OpsSnapshot } from '../lib/ops'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import type { WebPlatformStatus } from '../lib/platform-status'
import { OpsAutoRefresh } from './ops-client-controls'

type Platform = OpsPlatformGroup['platform']

function formatTime(value: number, locale: WebLocale) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function platformMeta(platform: Platform, locale: WebLocale) {
  if (platform === 'whatsapp') return { label: opsExtraT(locale, 'platformGroups.whatsapp'), Icon: MessageCircleMore }
  if (platform === 'discord') return { label: opsExtraT(locale, 'platformGroups.discord'), Icon: Server }
  return { label: opsExtraT(locale, 'platformGroups.telegram'), Icon: Send }
}

function maskedAccount(status: WebPlatformStatus | undefined) {
  if (!status?.accountLabel) return null
  if (status.id !== 'whatsapp') return status.accountLabel
  const raw = status.accountLabel.split('@')[0]?.split(':')[0] ?? ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 6) return '••••'
  return `${digits.slice(0, 2)}••••••${digits.slice(-4)}`
}

function statusBadge(status: WebPlatformStatus | undefined, locale: WebLocale) {
  if (!status?.known) return <span className="ops-badge-warn">{opsExtraT(locale, 'platformGroups.unknownStatus')}</span>
  if (status.enabled === false) return <span className="ops-badge">{opsExtraT(locale, 'platformGroups.disabled')}</span>
  if (status.connected) return <span className="ops-badge-good">{opsExtraT(locale, 'platformGroups.online')}</span>
  return <span className="ops-badge-bad">{opsExtraT(locale, 'platformGroups.offline')}</span>
}

function emptyText(platform: Platform, locale: WebLocale) {
  if (platform === 'whatsapp') return opsExtraT(locale, 'platformGroups.waEmpty')
  if (platform === 'discord') return opsExtraT(locale, 'platformGroups.discordEmpty')
  return opsExtraT(locale, 'platformGroups.telegramEmpty')
}

function PlatformSection({ platform, rows, locale, status }: {
  platform: Platform
  rows: OpsPlatformGroup[]
  locale: WebLocale
  status?: WebPlatformStatus
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const { label, Icon } = platformMeta(platform, locale)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  const countText = x('platformGroups.count').replace('{count}', String(rows.length))
  const complete = rows.some((row) => row.authoritative)

  return <section className="ops-panel overflow-hidden">
    <div className="flex items-center gap-3 border-b border-white/[.08] px-5 py-4">
      <span className="grid size-9 place-items-center rounded-xl border border-white/[.08] bg-white/[.03]">
        <Icon className="size-4 text-blue-400"/>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-white">{label}</h3>
        <p className="mt-0.5 text-xs text-zinc-600">{countText}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {statusBadge(status, locale)}
        <span className={complete ? 'ops-badge-good' : 'ops-badge-warn'}>
          {complete ? x('platformGroups.authoritative') : x('platformGroups.observed')}
        </span>
      </div>
    </div>

    {status?.accountLabel || status?.detail ? <div className="border-b border-white/[.06] px-5 py-3 text-xs text-zinc-600">
      {maskedAccount(status) ? <span className="mr-3 font-semibold text-zinc-400">{maskedAccount(status)}</span> : null}
      {status.detail ? <span>{status.detail}</span> : null}
    </div> : null}

    {rows.length ? <div className="divide-y divide-white/[.06]">
      {rows.map((row) => <article key={platform + ':' + row.externalId} className="px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('platformGroups.name')}</p>
            <p className="mt-1 truncate font-semibold text-zinc-100">
              {row.name && row.name !== row.externalId ? row.name : x('platformGroups.unknown')}
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-700">{x('platformGroups.id')}: {row.externalId}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={row.authoritative ? 'ops-badge-good' : 'ops-badge-warn'}>
              {row.authoritative ? x('platformGroups.authoritative') : x('platformGroups.observed')}
            </span>
            <span className="ops-badge">{row.kind.toUpperCase()}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
          <span>
            <UsersRound className="mr-1.5 inline size-3.5"/>
            {row.memberCount === null ? x('platformGroups.unknown') : row.memberCount.toLocaleString(intl) + ' ' + x('platformGroups.members')}
          </span>
          {row.adminCount !== null ? <span>
            <ShieldCheck className="mr-1.5 inline size-3.5"/>
            {row.adminCount.toLocaleString(intl)} {x('platformGroups.admins')}
          </span> : null}
          <span>{x('platformGroups.updated')}: {formatTime(row.updatedAt, locale)}</span>
        </div>
      </article>)}
    </div> : <div className="px-5 py-8 text-sm leading-6 text-zinc-600">{emptyText(platform, locale)}</div>}
  </section>
}

export function PlatformGroupsPanel({ snapshot, instanceLabel, locale, csrfToken, canSyncWhatsApp, platformStatuses }: {
  snapshot: OpsSnapshot
  instanceLabel: string
  locale: WebLocale
  csrfToken: string
  canSyncWhatsApp: boolean
  platformStatuses: WebPlatformStatus[]
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const byPlatform = {
    whatsapp: snapshot.platformGroups.filter((row) => row.platform === 'whatsapp'),
    discord: snapshot.platformGroups.filter((row) => row.platform === 'discord'),
    telegram: snapshot.platformGroups.filter((row) => row.platform === 'telegram'),
  }
  const statusByPlatform = new Map(platformStatuses.map((item) => [item.id, item]))

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">{x('platformGroups.title')}</h2>
          <p className="mt-1 text-xs text-zinc-500">{x('platformGroups.subtitle')} · {instanceLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OpsAutoRefresh seconds={10}/>
          {canSyncWhatsApp ? <form action="/api/control" method="post">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <input type="hidden" name="action" value="sync_groups"/>
            <input type="hidden" name="instance" value={snapshot.instanceKey}/>
            <input type="hidden" name="section" value="groups"/>
            <button className="ops-button-primary"><RefreshCcw className="size-4"/>{x('platformGroups.sync')}</button>
          </form> : null}
        </div>
      </div>

      <div className="grid gap-3 border-t border-white/[.08] p-5 md:grid-cols-3">
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('platformGroups.waSyncOk')}</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">
            {snapshot.runtime.lastGroupSyncAt ? formatTime(snapshot.runtime.lastGroupSyncAt, locale) : x('platformGroups.waNever')}
          </p>
        </div>
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('platformGroups.waSyncAttempt')}</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">{formatTime(snapshot.runtime.lastGroupSyncAttemptAt, locale)}</p>
        </div>
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{x('platformGroups.waError')}</p>
          <p className={snapshot.runtime.lastGroupSyncError ? 'mt-2 break-words text-xs text-red-300' : 'mt-2 text-sm font-semibold text-emerald-300'}>
            {snapshot.runtime.lastGroupSyncError || 'OK'}
          </p>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-3">
      <PlatformSection platform="whatsapp" rows={byPlatform.whatsapp} locale={locale} status={statusByPlatform.get('whatsapp')}/>
      <PlatformSection platform="discord" rows={byPlatform.discord} locale={locale} status={statusByPlatform.get('discord')}/>
      <PlatformSection platform="telegram" rows={byPlatform.telegram} locale={locale} status={statusByPlatform.get('telegram')}/>
    </div>

    <p className="px-1 text-xs leading-5 text-zinc-600">{x('platformGroups.telegramNote')}</p>
  </div>
}
