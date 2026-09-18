import { MessageCircleMore, RefreshCcw, Send, Server, ShieldCheck, UsersRound } from 'lucide-react'
import type { OpsPlatformGroup, OpsSnapshot } from '../lib/ops'
import type { WebLocale } from '../lib/i18n'
import { OpsAutoRefresh } from './ops-client-controls'

type Platform = OpsPlatformGroup['platform']

const copy = {
  es: {
    title: 'Grupos por plataforma',
    subtitle: 'Inventario persistente de comunidades donde participa esta instancia.',
    whatsapp: 'WhatsApp',
    discord: 'Discord',
    telegram: 'Telegram',
    authoritative: 'INVENTARIO COMPLETO',
    observed: 'OBSERVADO',
    members: 'miembros',
    admins: 'admins',
    unknown: 'Sin dato',
    id: 'ID',
    updated: 'Actualizado',
    sync: 'Sincronizar WhatsApp',
    waEmpty: 'Todavía no hay grupos de WhatsApp registrados. Ejecuta una sincronización; además, los grupos se recuperan automáticamente por eventos y tráfico real.',
    discordEmpty: 'No hay servidores de Discord registrados para esta instancia. Al conectarse el Gateway, el inventario se sincroniza automáticamente.',
    telegramEmpty: 'No hay grupos de Telegram observados todavía. Telegram Bot API no ofrece una lista histórica completa; se registran grupos/supergrupos cuando llegan mensajes o cambios de membresía del bot.',
    telegramNote: 'Telegram: inventario observado. Bot API no permite enumerar todos los grupos históricos de un bot.',
    waSyncOk: 'Última sincronización completa',
    waSyncAttempt: 'Último intento',
    waNever: 'Sin sincronización completa todavía',
    waError: 'Último error de sincronización',
    count: '{count} comunidad(es)',
  },
  en: {
    title: 'Groups by platform',
    subtitle: 'Persistent inventory of communities joined by this instance.',
    whatsapp: 'WhatsApp',
    discord: 'Discord',
    telegram: 'Telegram',
    authoritative: 'COMPLETE INVENTORY',
    observed: 'OBSERVED',
    members: 'members',
    admins: 'admins',
    unknown: 'No data',
    id: 'ID',
    updated: 'Updated',
    sync: 'Sync WhatsApp',
    waEmpty: 'No WhatsApp groups are registered yet. Run a sync; groups are also recovered automatically from group events and real traffic.',
    discordEmpty: 'No Discord servers are registered for this instance. The inventory syncs automatically when the Gateway connects.',
    telegramEmpty: 'No Telegram groups have been observed yet. Telegram Bot API does not expose a complete historical group list; groups/supergroups are recorded from messages and bot membership updates.',
    telegramNote: 'Telegram: observed inventory. Bot API cannot enumerate every historical group joined by a bot.',
    waSyncOk: 'Last complete sync',
    waSyncAttempt: 'Last attempt',
    waNever: 'No complete synchronization yet',
    waError: 'Last synchronization error',
    count: '{count} community(ies)',
  },
} as const

function formatTime(value: number, locale: WebLocale) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function platformMeta(platform: Platform, locale: WebLocale) {
  const t = copy[locale]
  if (platform === 'whatsapp') return { label: t.whatsapp, Icon: MessageCircleMore }
  if (platform === 'discord') return { label: t.discord, Icon: Server }
  return { label: t.telegram, Icon: Send }
}

function emptyText(platform: Platform, locale: WebLocale) {
  const t = copy[locale]
  if (platform === 'whatsapp') return t.waEmpty
  if (platform === 'discord') return t.discordEmpty
  return t.telegramEmpty
}

function PlatformSection({ platform, rows, locale }: {
  platform: Platform
  rows: OpsPlatformGroup[]
  locale: WebLocale
}) {
  const t = copy[locale]
  const { label, Icon } = platformMeta(platform, locale)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  return <section className="ops-panel overflow-hidden">
    <div className="flex items-center gap-3 border-b border-white/[.08] px-5 py-4">
      <span className="grid size-9 place-items-center rounded-xl border border-white/[.08] bg-white/[.03]">
        <Icon className="size-4 text-blue-400"/>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-white">{label}</h3>
        <p className="mt-0.5 text-xs text-zinc-600">{t.count.replace('{count}', String(rows.length))}</p>
      </div>
      <span className={rows.some((row) => row.authoritative) ? 'ops-badge-good' : 'ops-badge-warn'}>
        {rows.some((row) => row.authoritative) ? t.authoritative : t.observed}
      </span>
    </div>

    {rows.length ? <div className="divide-y divide-white/[.06]">
      {rows.map((row) => <article key={platform + ':' + row.externalId} className="px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-100">{row.name}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-700">{t.id}: {row.externalId}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={row.authoritative ? 'ops-badge-good' : 'ops-badge-warn'}>
              {row.authoritative ? t.authoritative : t.observed}
            </span>
            <span className="ops-badge">{row.kind.toUpperCase()}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
          <span><UsersRound className="mr-1.5 inline size-3.5"/>{row.memberCount === null ? t.unknown : row.memberCount.toLocaleString(intl) + ' ' + t.members}</span>
          {row.adminCount !== null ? <span><ShieldCheck className="mr-1.5 inline size-3.5"/>{row.adminCount.toLocaleString(intl)} {t.admins}</span> : null}
          <span>{t.updated}: {formatTime(row.updatedAt, locale)}</span>
        </div>
      </article>)}
    </div> : <div className="px-5 py-8 text-sm leading-6 text-zinc-600">{emptyText(platform, locale)}</div>}
  </section>
}

export function PlatformGroupsPanel({ snapshot, instanceLabel, locale, csrfToken, canSyncWhatsApp }: {
  snapshot: OpsSnapshot
  instanceLabel: string
  locale: WebLocale
  csrfToken: string
  canSyncWhatsApp: boolean
}) {
  const t = copy[locale]
  const byPlatform = {
    whatsapp: snapshot.platformGroups.filter((row) => row.platform === 'whatsapp'),
    discord: snapshot.platformGroups.filter((row) => row.platform === 'discord'),
    telegram: snapshot.platformGroups.filter((row) => row.platform === 'telegram'),
  }

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">{t.title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t.subtitle} · {instanceLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OpsAutoRefresh seconds={10}/>
          {canSyncWhatsApp ? <form action="/api/control" method="post">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <input type="hidden" name="action" value="sync_groups"/>
            <input type="hidden" name="instance" value={snapshot.instanceKey}/>
            <input type="hidden" name="section" value="groups"/>
            <button className="ops-button-primary"><RefreshCcw className="size-4"/>{t.sync}</button>
          </form> : null}
        </div>
      </div>

      <div className="grid gap-3 border-t border-white/[.08] p-5 md:grid-cols-3">
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t.waSyncOk}</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">{snapshot.runtime.lastGroupSyncAt ? formatTime(snapshot.runtime.lastGroupSyncAt, locale) : t.waNever}</p>
        </div>
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t.waSyncAttempt}</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">{formatTime(snapshot.runtime.lastGroupSyncAttemptAt, locale)}</p>
        </div>
        <div className="ops-node">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t.waError}</p>
          <p className={snapshot.runtime.lastGroupSyncError ? 'mt-2 break-words text-xs text-red-300' : 'mt-2 text-sm font-semibold text-emerald-300'}>
            {snapshot.runtime.lastGroupSyncError || 'OK'}
          </p>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-3">
      <PlatformSection platform="whatsapp" rows={byPlatform.whatsapp} locale={locale}/>
      <PlatformSection platform="discord" rows={byPlatform.discord} locale={locale}/>
      <PlatformSection platform="telegram" rows={byPlatform.telegram} locale={locale}/>
    </div>

    <p className="px-1 text-xs leading-5 text-zinc-600">{t.telegramNote}</p>
  </div>
}
