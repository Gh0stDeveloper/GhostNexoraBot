import { CalendarDays, Lock, MessageSquare, ShieldCheck, Unlock, UsersRound, Volume2, VolumeX } from 'lucide-react'
import { readGroupInsights } from '../lib/group-insights'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'

export function GroupActivityPanel({ instanceKey, locale, csrfToken, canManageGroups = false }: { instanceKey: string; locale: WebLocale; csrfToken: string; canManageGroups?: boolean }) {
  const rows = readGroupInsights(instanceKey, 25)
  const intl = locale === 'es' ? 'es-MX' : 'en-US'
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  return <section className="ops-panel overflow-hidden">
    <div className="flex items-start gap-3 border-b border-white/[.08] px-5 py-5">
      <UsersRound className="mt-0.5 size-5 shrink-0 text-blue-400"/>
      <div><h2 className="font-bold text-white">{t('group.insightsTitle')}</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{t('group.insightsText')}</p></div>
      <span className="ml-auto font-mono text-xs text-zinc-600">{rows.length}</span>
    </div>
    {rows.length ? <div className="grid gap-3 p-5 xl:grid-cols-2">
      {rows.map((group) => <article key={group.groupJid} className="ops-node">
        <div className="flex items-start gap-3">
          {group.pictureUrl ? <img src={group.pictureUrl} alt="" className="size-12 shrink-0 rounded-xl border border-white/[.08] object-cover" referrerPolicy="no-referrer"/> : <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.03] text-lg font-black text-zinc-500">{group.name.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0 flex-1"><p className="truncate font-bold text-zinc-100">{group.name}</p><p className="mt-1 truncate font-mono text-[10px] text-zinc-700">{group.groupJid}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className={group.announce ? 'ops-badge-warn' : 'ops-badge-good'}>{group.announce ? t('group.adminsOnly') : t('group.everyoneWrites')}</span><span className={group.restrictMode ? 'ops-badge-warn' : 'ops-badge-good'}>{group.restrictMode ? t('group.lockedInfo') : t('group.openInfo')}</span></div></div>
        </div>
        {group.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-500">{group.description}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-lg border border-white/[.06] bg-black/20 p-2.5"><MessageSquare className="size-3.5 text-blue-400"/><span className="mt-2 block text-[10px] text-zinc-600">{t('group.messagesToday')}</span><strong className="font-mono text-sm text-zinc-200">{group.messagesToday.toLocaleString(intl)}</strong></div>
          <div className="rounded-lg border border-white/[.06] bg-black/20 p-2.5"><MessageSquare className="size-3.5 text-blue-400"/><span className="mt-2 block text-[10px] text-zinc-600">{t('group.messages7d')}</span><strong className="font-mono text-sm text-zinc-200">{group.messages7d.toLocaleString(intl)}</strong></div>
          <div className="rounded-lg border border-white/[.06] bg-black/20 p-2.5"><MessageSquare className="size-3.5 text-blue-400"/><span className="mt-2 block text-[10px] text-zinc-600">{t('group.messages30d')}</span><strong className="font-mono text-sm text-zinc-200">{group.messages30d.toLocaleString(intl)}</strong></div>
          <div className="rounded-lg border border-white/[.06] bg-black/20 p-2.5"><UsersRound className="size-3.5 text-blue-400"/><span className="mt-2 block text-[10px] text-zinc-600">{t('group.activeToday')}</span><strong className="font-mono text-sm text-zinc-200">{group.activeToday.toLocaleString(intl)}</strong></div>
          <div className="rounded-lg border border-white/[.06] bg-black/20 p-2.5"><ShieldCheck className="size-3.5 text-blue-400"/><span className="mt-2 block text-[10px] text-zinc-600">{t('group.members')}</span><strong className="font-mono text-sm text-zinc-200">{group.participantCount.toLocaleString(intl)}</strong></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600"><CalendarDays className="size-3.5"/><span>{group.createdAt ? `${t('group.created')}: ${new Date(group.createdAt).toLocaleDateString(intl)}` : t('group.createdUnknown')}</span></div>
          {canManageGroups ? <div className="flex flex-wrap gap-2">
            <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="instance" value={instanceKey}/><input type="hidden" name="groupJid" value={group.groupJid}/><input type="hidden" name="action" value={group.announce ? 'group_announce_off' : 'group_announce_on'}/><button className="ops-button-muted text-xs">{group.announce ? <Volume2 className="size-3.5"/> : <VolumeX className="size-3.5"/>}{group.announce ? t('group.enableEveryone') : t('group.enableAdminsOnly')}</button></form>
            <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="instance" value={instanceKey}/><input type="hidden" name="groupJid" value={group.groupJid}/><input type="hidden" name="action" value={group.restrictMode ? 'group_lock_off' : 'group_lock_on'}/><button className="ops-button-muted text-xs">{group.restrictMode ? <Unlock className="size-3.5"/> : <Lock className="size-3.5"/>}{group.restrictMode ? t('group.unlockInfo') : t('group.lockInfo')}</button></form>
          </div> : null}
        </div>
      </article>)}
    </div> : <div className="px-5 py-8 text-center text-sm text-zinc-600">{t('group.emptyInsights')}</div>}
  </section>
}
