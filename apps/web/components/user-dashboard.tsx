import {
  Activity, BadgeDollarSign, Bot, BriefcaseBusiness, CircleAlert, Coins, PackageOpen,
  Search, ShieldCheck, SquareTerminal, UserRound, UsersRound, WalletCards,
} from 'lucide-react'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import type { UserDashboardDetail, UserDashboardPermissions, UserSearchRow } from '../lib/user-dashboard'

function formatTime(value: number, locale: WebLocale) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function compactJid(value: string) {
  if (value.length <= 34) return value
  return `${value.slice(0, 15)}…${value.slice(-15)}`
}

export function UserDashboard({
  rows,
  detail,
  query,
  instanceKey,
  instanceLabel,
  locale,
  permissions,
}: {
  rows: UserSearchRow[]
  detail: UserDashboardDetail | null
  query: string
  instanceKey: string
  instanceLabel: string
  locale: WebLocale
  permissions: UserDashboardPermissions
}) {
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  const base = `/admin?instance=${encodeURIComponent(instanceKey)}&section=users`

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-2"><UsersRound className="size-5 text-blue-400"/><h2 className="text-lg font-black text-white">{x('users.title')}</h2></div>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{x('users.subtitle')} · {instanceLabel}</p>
      </div>
      <form method="get" action="/admin" className="flex flex-col gap-2 p-5 sm:flex-row">
        <input type="hidden" name="instance" value={instanceKey}/>
        <input type="hidden" name="section" value="users"/>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600"/>
          <input className="ops-input w-full pl-9" name="q" defaultValue={query} placeholder={x('users.searchPlaceholder')} maxLength={120}/>
        </div>
        <button className="ops-button-primary"><Search className="size-4"/>{x('users.search')}</button>
      </form>
    </section>

    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <section className="ops-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4">
          <h3 className="font-bold text-white">{x('users.results')}</h3>
          <span className="ops-badge">{rows.length.toLocaleString(intl)}</span>
        </div>
        {rows.length ? <div className="max-h-[760px] divide-y divide-white/[.06] overflow-y-auto">
          {rows.map((row) => {
            const href = `${base}&q=${encodeURIComponent(query)}&user=${encodeURIComponent(row.userJid)}`
            return <article key={row.userJid} className={detail?.userJid === row.userJid ? 'bg-blue-500/[.04] px-5 py-4' : 'px-5 py-4'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-100">{row.displayName || row.number || x('users.name')}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{compactJid(row.userJid)}</p>
                </div>
                <a href={href} className="ops-button-muted shrink-0 text-xs">{x('users.view')}</a>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                <span><SquareTerminal className="mr-1 inline size-3"/>{row.requests.toLocaleString(intl)} {x('users.commands')}</span>
                <span><UsersRound className="mr-1 inline size-3"/>{row.groups.toLocaleString(intl)} {x('users.groups')}</span>
                <span>{x('users.level')} {row.level}</span>
                {permissions.moderation && row.warnings !== null ? <span>{x('users.warnings')}: {row.warnings.toLocaleString(intl)}</span> : null}
              </div>
            </article>
          })}
        </div> : <p className="px-5 py-10 text-sm text-zinc-600">{x('users.empty')}</p>}
      </section>

      <section className="ops-panel overflow-hidden">
        {!detail ? <div className="grid min-h-72 place-items-center p-8 text-center">
          <div><UserRound className="mx-auto size-8 text-zinc-700"/><p className="mt-3 text-sm text-zinc-500">{x('users.selectUser')}</p></div>
        </div> : <>
          <div className="border-b border-white/[.08] px-5 py-5">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-500">{x('users.profile')}</p>
            <h3 className="mt-1 text-xl font-black text-white">{detail.displayName || detail.number || detail.userJid}</h3>
            <p className="mt-1 break-all font-mono text-[11px] text-zinc-600">{detail.userJid}</p>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="ops-stat"><Activity className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.commands')}</p><p className="mt-1 text-xl font-black">{detail.requests.toLocaleString(intl)}</p></div>
            <div className="ops-stat"><BadgeDollarSign className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.xp')}</p><p className="mt-1 text-xl font-black">{detail.xp.toLocaleString(intl)}</p></div>
            <div className="ops-stat"><ShieldCheck className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.level')}</p><p className="mt-1 text-xl font-black">{detail.level.toLocaleString(intl)}</p></div>
            <div className="ops-stat"><UsersRound className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.groups')}</p><p className="mt-1 text-xl font-black">{detail.groups.toLocaleString(intl)}</p></div>
          </div>

          <div className="grid gap-3 border-t border-white/[.06] p-5 sm:grid-cols-2">
            <div className="ops-node"><p className="text-[10px] font-bold uppercase text-zinc-600">{x('users.firstSeen')}</p><p className="mt-2 text-sm font-semibold text-zinc-200">{formatTime(detail.firstAt, locale)}</p></div>
            <div className="ops-node"><p className="text-[10px] font-bold uppercase text-zinc-600">{x('users.lastActivity')}</p><p className="mt-2 text-sm font-semibold text-zinc-200">{formatTime(detail.lastAt, locale)}</p></div>
            <div className="ops-node"><p className="text-[10px] font-bold uppercase text-zinc-600">{x('users.successes')}</p><p className="mt-2 font-mono text-sm text-emerald-300">{detail.successes.toLocaleString(intl)}</p></div>
            <div className="ops-node"><p className="text-[10px] font-bold uppercase text-zinc-600">{x('users.failures')}</p><p className="mt-2 font-mono text-sm text-red-300">{detail.failures.toLocaleString(intl)}</p></div>
          </div>

          <div className="grid gap-3 border-t border-white/[.06] p-5 sm:grid-cols-2 lg:grid-cols-4">
            {permissions.financial ? <>
              <div className="ops-node"><WalletCards className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.wallet')}</p><p className="mt-1 font-mono font-bold text-zinc-100">{(detail.wallet ?? 0).toLocaleString(intl)}</p></div>
              <div className="ops-node"><Coins className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.bank')}</p><p className="mt-1 font-mono font-bold text-zinc-100">{(detail.bank ?? 0).toLocaleString(intl)}</p></div>
              <div className="ops-node"><Coins className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.totalNxc')}</p><p className="mt-1 font-mono font-bold text-zinc-100">{(detail.totalNxc ?? 0).toLocaleString(intl)}</p></div>
            </> : <div className="ops-node sm:col-span-2"><p className="text-xs text-zinc-600">{x('users.restricted')}</p></div>}
            <div className="ops-node"><BriefcaseBusiness className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase text-zinc-600">{x('users.profession')}</p><p className="mt-1 font-mono text-sm font-bold text-zinc-100">{detail.profession || '—'}</p></div>
          </div>
        </>}
      </section>
    </div>

    {detail ? <>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><SquareTerminal className="size-4 text-blue-400"/><h3 className="font-bold">{x('users.commandBreakdown')}</h3></div><p className="mt-1 text-xs text-zinc-500">{x('users.commandBreakdownText')}</p></div>
          {detail.commandBreakdown.length ? <div className="divide-y divide-white/[.06]">{detail.commandBreakdown.map((item) => <div key={item.commandName} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-mono text-zinc-300">.{item.commandName}</span><span className="text-zinc-500">{item.requests.toLocaleString(intl)} · {item.successes.toLocaleString(intl)}/{item.failures.toLocaleString(intl)}</span></div>)}</div> : <p className="px-5 py-8 text-sm text-zinc-600">{x('users.empty')}</p>}
        </section>

        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><UsersRound className="size-4 text-blue-400"/><h3 className="font-bold">{x('users.groupBreakdown')}</h3></div><p className="mt-1 text-xs text-zinc-500">{x('users.groupBreakdownText')}</p></div>
          {detail.groupBreakdown.length ? <div className="max-h-[460px] divide-y divide-white/[.06] overflow-y-auto">{detail.groupBreakdown.map((group) => <div key={group.groupJid} className="px-5 py-3"><p className="truncate text-sm font-semibold text-zinc-200">{group.name}</p><p className="mt-1 break-all font-mono text-[10px] text-zinc-700">{group.groupJid}</p><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500"><span>{x('users.messages')}: {group.messages.toLocaleString(intl)}</span><span>{x('users.commands')}: {group.commands.toLocaleString(intl)}</span><span>{formatTime(group.lastActivityAt, locale)}</span></div></div>)}</div> : <p className="px-5 py-8 text-sm text-zinc-600">{x('users.empty')}</p>}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><PackageOpen className="size-4 text-blue-400"/><h3 className="font-bold">{x('users.inventory')}</h3></div></div>
          {!permissions.financial ? <p className="px-5 py-8 text-sm text-zinc-600">{x('users.restricted')}</p> : detail.inventory.length ? <div className="divide-y divide-white/[.06]">{detail.inventory.map((item) => <div key={item.item} className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-mono text-zinc-300">{item.item}</span><span className="ops-badge">×{item.quantity.toLocaleString(intl)}</span></div>)}</div> : <p className="px-5 py-8 text-sm text-zinc-600">{x('users.inventoryEmpty')}</p>}
        </section>

        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><CircleAlert className="size-4 text-blue-400"/><h3 className="font-bold">{x('users.warningDetail')}</h3></div></div>
          {!permissions.moderation ? <p className="px-5 py-8 text-sm text-zinc-600">{x('users.restricted')}</p> : detail.warningBreakdown.length ? <div className="divide-y divide-white/[.06]">{detail.warningBreakdown.map((warning) => <div key={warning.groupJid + ':' + warning.kind} className="px-5 py-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{warning.groupName}</span><span className="ops-badge-warn">{warning.kind.toUpperCase()} · {warning.count}</span></div><p className="mt-1 text-[10px] text-zinc-600">{formatTime(warning.lastWarning, locale)}</p></div>)}</div> : <p className="px-5 py-8 text-sm text-zinc-600">{x('users.noWarnings')}</p>}
          {permissions.moderation ? <div className="border-t border-white/[.06] px-5 py-4"><p className="text-[10px] font-bold uppercase text-zinc-600">{x('users.ban')}</p>{detail.banRegistryAvailable ? <span className={detail.banned ? 'ops-badge-bad mt-2' : 'ops-badge-good mt-2'}>{detail.banned ? x('users.banned') : x('users.notBanned')}</span> : <><span className="ops-badge mt-2">{x('users.banUnavailable')}</span><p className="mt-2 text-xs leading-5 text-zinc-600">{x('users.banUnavailableText')}</p></>}</div> : null}
        </section>

        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><Bot className="size-4 text-blue-400"/><h3 className="font-bold">{x('users.subbots')}</h3></div></div>
          {!permissions.subbots ? <p className="px-5 py-8 text-sm text-zinc-600">{x('users.restricted')}</p> : detail.subbots.length ? <div className="divide-y divide-white/[.06]">{detail.subbots.map((subbot) => <div key={subbot.id} className="px-5 py-3"><div className="flex items-center justify-between gap-2"><span className="font-mono font-bold text-blue-400">#{subbot.id}</span><span className={subbot.status === 'online' ? 'ops-badge-good' : 'ops-badge'}>{subbot.status.toUpperCase()}</span></div><p className="mt-1 font-mono text-xs text-zinc-500">{subbot.phone || '—'}</p><p className="mt-1 text-[10px] text-zinc-600">{x('users.expires')}: {formatTime(subbot.expiresAt, locale)}</p></div>)}</div> : <p className="px-5 py-8 text-sm text-zinc-600">{x('users.noSubbots')}</p>}
        </section>
      </div>
    </> : null}
  </div>
}
