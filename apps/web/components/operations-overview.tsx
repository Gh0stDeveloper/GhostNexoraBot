import { Activity, RefreshCcw, ServerCog, Signal, UsersRound } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import type { WebPlatformStatus } from '../lib/platform-status'
import { OpsAlertCenter } from './ops-alert-center'

function relativeTime(timestamp: number, locale: WebLocale) {
  if (!timestamp) return opsExtraT(locale, 'operations.never')
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60_000) return opsExtraT(locale, 'operations.secondsAgo').replace('{value}', String(Math.max(1, Math.round(diff / 1000))))
  if (diff < 3_600_000) return opsExtraT(locale, 'operations.minutesAgo').replace('{value}', String(Math.round(diff / 60_000)))
  if (diff < 86_400_000) return opsExtraT(locale, 'operations.hoursAgo').replace('{value}', String(Math.round(diff / 3_600_000)))
  return opsExtraT(locale, 'operations.daysAgo').replace('{value}', String(Math.round(diff / 86_400_000)))
}

export function OperationsOverview({ snapshot, platformStatuses, locale }: {
  snapshot: OpsSnapshot
  platformStatuses: WebPlatformStatus[]
  locale: WebLocale
}) {
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  const activePlatforms = platformStatuses.filter((item) => item.connected).length
  const knownPlatforms = platformStatuses.filter((item) => item.known && item.enabled !== false).length
  const providerIssues = snapshot.providers.filter((item) => item.status === 'offline' || item.status === 'degraded').length
  const groupCount = snapshot.platformGroups.length || snapshot.groups.length
  const syncState = snapshot.runtime.lastGroupSyncError
    ? opsExtraT(locale, 'operations.problem')
    : snapshot.runtime.lastGroupSyncAt
      ? opsExtraT(locale, 'operations.synced')
      : opsExtraT(locale, 'operations.pending')
  const syncNote = snapshot.runtime.lastGroupSyncError
    ? snapshot.runtime.lastGroupSyncError
    : relativeTime(snapshot.runtime.lastGroupSyncAt, locale)

  const cards = [
    {
      icon: Activity,
      label: opsExtraT(locale, 'operations.platforms'),
      value: `${activePlatforms}/${Math.max(knownPlatforms, platformStatuses.length)}`,
      note: opsExtraT(locale, 'operations.platformsNote'),
      danger: knownPlatforms > 0 && activePlatforms < knownPlatforms,
    },
    {
      icon: Signal,
      label: opsExtraT(locale, 'operations.throughput'),
      value: `${snapshot.summary.throughputMps.toFixed(2)} MPS`,
      note: opsExtraT(locale, 'operations.throughputNote'),
      danger: false,
    },
    {
      icon: UsersRound,
      label: opsExtraT(locale, 'operations.groups'),
      value: groupCount.toLocaleString(intl),
      note: opsExtraT(locale, 'operations.groupsNote'),
      danger: snapshot.runtime.connected && groupCount === 0,
    },
    {
      icon: ServerCog,
      label: opsExtraT(locale, 'operations.providers'),
      value: providerIssues.toLocaleString(intl),
      note: providerIssues ? opsExtraT(locale, 'operations.providerIssues') : opsExtraT(locale, 'operations.providersHealthy'),
      danger: providerIssues > 0,
    },
    {
      icon: RefreshCcw,
      label: opsExtraT(locale, 'operations.groupSync'),
      value: syncState,
      note: syncNote,
      danger: Boolean(snapshot.runtime.lastGroupSyncError),
    },
  ]

  return <div className="space-y-6">
    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <h2 className="font-bold text-white">{opsExtraT(locale, 'operations.title')}</h2>
        <p className="mt-1 text-xs text-zinc-500">{opsExtraT(locale, 'operations.subtitle')}</p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(({ icon: Icon, label, value, note, danger }) => <article key={label} className="ops-stat min-h-0">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</p><Icon className="size-4 text-blue-400"/></div>
          <p className={danger ? 'mt-3 text-xl font-black text-red-400' : 'mt-3 text-xl font-black text-white'}>{value}</p>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{note}</p>
        </article>)}
      </div>
    </section>

    <OpsAlertCenter instanceKey={snapshot.instanceKey} runtime={snapshot.runtime} locale={locale}/>
  </div>
}
