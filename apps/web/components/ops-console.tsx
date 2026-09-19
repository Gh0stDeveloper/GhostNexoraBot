import { UsersRound } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'
import { AdminAuditTable } from './admin-audit-table'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'
import { GroupActivityPanel } from './group-activity-panel'

export type OpsConsoleView = 'groups' | 'audit'

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

export function OpsConsole({ snapshot, instanceLabel, view, locale, csrfToken, canSyncGroups = false, canManageGroups = false, canLeaveGroups = false }: {
  snapshot: OpsSnapshot
  instanceLabel: string
  view: OpsConsoleView
  locale: WebLocale
  csrfToken: string
  canSyncGroups?: boolean
  canManageGroups?: boolean
  canLeaveGroups?: boolean
}) {
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const x = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)

  if (view === 'audit') {
    return <AdminAuditTable rows={snapshot.adminAudit} locale={locale}/>
  }

  return <div className="space-y-6">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><UsersRound className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{t('ops.groupsTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('ops.groupsText', { count: snapshot.groups.length, instance: instanceLabel })}</p></div></div>
        <div className="flex flex-wrap gap-2"><OpsAutoRefresh seconds={10}/>{canSyncGroups ? <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="action" value="sync_groups"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><button className="ops-button-muted">{t('ops.syncGroups')}</button></form> : null}</div>
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
                    {canManageGroups ? (muted ? <form action="/api/control" method="post">
                      <input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="action" value="unmute_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                      <button className="ops-button-muted text-xs">{x('group.unmute')}</button>
                    </form> : <>
                      <form action="/api/control" method="post">
                        <input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="action" value="mute_group_8h"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                        <button className="ops-button-muted text-xs">{x('group.mute8h')}</button>
                      </form>
                      <form action="/api/control" method="post">
                        <input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="action" value="mute_group_7d"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/>
                        <button className="ops-button-muted text-xs">{x('group.mute7d')}</button>
                      </form>
                    </>) : null}
                    {canLeaveGroups ? <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="action" value="leave_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/><ConfirmSubmitButton className="ops-button-danger" confirmText={t('ops.leaveConfirm', { instance: instanceLabel, group: group.name })}>{t('ops.leave')}</ConfirmSubmitButton></form> : null}
                  </div>
                </td>
              </tr>
            }) : <tr><td colSpan={6} className="py-10 text-center text-zinc-500">{t('ops.noGroups')}</td></tr>}
          </tbody>
        </table>
      </div>
      {snapshot.requests.length > 0 && <div className="border-t border-white/[.08] px-5 py-4 text-xs text-zinc-600">{t('ops.lastOperation', { action: snapshot.requests[0].action, status: snapshot.requests[0].status, error: snapshot.requests[0].error ? ` · ${snapshot.requests[0].error}` : '' })}</div>}
    </section>

    <GroupActivityPanel instanceKey={snapshot.instanceKey} locale={locale} csrfToken={csrfToken} canManageGroups={canManageGroups}/>
  </div>
}
