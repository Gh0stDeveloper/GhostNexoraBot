import { Activity, Bot, Clock3, Download, Gauge, LayoutDashboard, LogOut, RefreshCcw, ServerCog, Settings, Smartphone, SquareTerminal, UsersRound, Wrench } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CommandCenter } from '../../components/command-center'
import { DeveloperDiagnostics } from '../../components/developer-diagnostics'
import { OperationsOverview } from '../../components/operations-overview'
import { OpsConsole } from '../../components/ops-console'
import { OpsUsageDashboard } from '../../components/ops-usage-dashboard'
import { PlatformGroupsPanel } from '../../components/platform-groups-panel'
import { PlatformsDashboard } from '../../components/platforms-dashboard'
import { ProvidersDashboard } from '../../components/providers-dashboard'
import { JobsDashboard } from '../../components/jobs-dashboard'
import { RealtimeLogsDashboard } from '../../components/realtime-logs-dashboard'
import { SecurityCenter } from '../../components/security-center'
import { UnifiedNavigation, type UnifiedNavIcon, type UnifiedNavItem } from '../../components/unified-navigation'
import { SUBBOT_SESSION_COOKIE, sessionCsrfToken, verifySession } from '../../lib/auth'
import { getWebLocale } from '../../lib/i18n-server'
import { webIntlLocale, webT } from '../../lib/i18n'
import { readOpsSnapshot } from '../../lib/ops'
import { readOpsJobs } from '../../lib/ops-jobs'
import { readOpsRuntimeLogCounts, readOpsRuntimeLogs } from '../../lib/ops-observability'
import { subbotPlatformStatuses } from '../../lib/platform-status'
import { openBotDb } from '../../lib/runtime'

export const dynamic = 'force-dynamic'
type SubbotRow = { id: number; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }
type SubbotSection = 'overview' | 'platforms' | 'providers' | 'commands' | 'groups' | 'logs' | 'jobs' | 'audit' | 'diagnostics' | 'account'
const sectionIds: SubbotSection[] = ['overview', 'platforms', 'providers', 'commands', 'groups', 'logs', 'jobs', 'audit', 'diagnostics', 'account']

function normalizeSection(value?: string): SubbotSection {
  return sectionIds.includes(value as SubbotSection) ? value as SubbotSection : 'overview'
}

export default async function SubbotPortal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; section?: string; jobQ?: string; jobStatus?: string; jobType?: string }> }) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'subbot') redirect('/login?mode=subbot')
  const csrfToken = sessionCsrfToken(session)
  const locale = await getWebLocale()
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const sections: Array<[SubbotSection, string, typeof Bot]> = [
    ['overview', t('nav.overview'), LayoutDashboard],
    ['platforms', t('nav.platforms'), Activity],
    ['providers', t('nav.providers'), ServerCog],
    ['commands', t('nav.commands'), SquareTerminal],
    ['groups', t('nav.groups'), UsersRound],
    ['logs', t('nav.logs'), SquareTerminal],
    ['jobs', t('nav.jobs'), Activity],
    ['audit', t('nav.audit'), Gauge],
    ['diagnostics', t('nav.diagnostics'), Wrench],
    ['account', t('nav.account'), Settings],
  ]
  const params = await searchParams
  const section = normalizeSection(params.section)
  const db = openBotDb()
  if (!db) return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">{t('subbot.unavailable')}</h1><p className="mt-3 text-zinc-400">{t('subbot.dbUnavailable')}</p></main>
  const subbot = db.prepare(`SELECT id, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots WHERE id = ? AND expires_at > ?`).get(session.subbotId, Date.now()) as SubbotRow | undefined
  db.close()
  if (!subbot) redirect('/login?mode=subbot&error=invalid')

  const instanceKey = `subbot:${subbot.id}`
  const snapshot = readOpsSnapshot(instanceKey)
  const platformStatuses = subbotPlatformStatuses(snapshot.runtime)
  const realtimeLogRows = section === 'logs' ? readOpsRuntimeLogs(instanceKey, 200) : []
  const realtimeLogCounts = section === 'logs'
    ? readOpsRuntimeLogCounts(instanceKey)
    : { total: 0, errors: 0, warnings: 0, commands: 0, api: 0, downloads: 0 }
  const jobFilters = {
    query: section === 'jobs' ? String(params.jobQ ?? '').trim().slice(0, 100) : '',
    status: section === 'jobs' ? String(params.jobStatus ?? '').trim().toLowerCase() : '',
    type: section === 'jobs' ? String(params.jobType ?? '').trim().toLowerCase() : '',
  }
  const jobsSnapshot = section === 'jobs'
    ? readOpsJobs(instanceKey, { ...jobFilters, limit: 250 })
    : { rows: [], counts: { active: 0, waiting: 0, running: 0, completed: 0, failed: 0, cancelled: 0 } }
  const labels: Record<string,string> = {
    pending: t('subbot.pending'), pairing: t('subbot.pairing'), online: t('common.online'), offline: t('subbot.offline'), logged_out: t('subbot.loggedOut'), revoked: t('subbot.revoked'),
  }
  const cards = [[Smartphone,t('subbot.number'),subbot.phone??t('common.unlinked')],[Bot,t('subbot.runtime'),snapshot.runtime.connected?t('admin.connected'):labels[subbot.status]??subbot.status],[Clock3,t('subbot.subscription'),new Date(Number(subbot.expiresAt)).toLocaleString(intl)],[UsersRound,t('subbot.groups'),(snapshot.platformGroups.length || snapshot.groups.length).toLocaleString(intl)],[Activity,t('admin.stat.platforms'),platformStatuses.filter((item) => item.connected).length.toLocaleString(intl)],[Download,t('subbot.downloads'),`${(Number(subbot.downloadBytes)/1024/1024).toFixed(1)} MB`]] as const
  const hrefFor = (target: SubbotSection) => `/subbot?section=${target}`
  const instanceLabel = `Subbot #${subbot.id}`
  const navIcon: Record<SubbotSection, UnifiedNavIcon> = {
    overview: 'dashboard',
    platforms: 'platforms',
    providers: 'providers',
    commands: 'commands',
    groups: 'groups',
    logs: 'logs',
    jobs: 'jobs',
    audit: 'audit',
    diagnostics: 'diagnostics',
    account: 'account',
  }
  const navigationItems: UnifiedNavItem[] = sections.map(([id, label]) => ({
    id,
    label,
    href: hrefFor(id),
    icon: navIcon[id],
    active: section === id,
  }))

  return <main className="ops-shell">
    <UnifiedNavigation
      items={navigationItems}
      brandTitle={`SUBBOT #${subbot.id}`}
      brandSubtitle={t('subbot.operations')}
      brandHref={hrefFor('overview')}
      badge={snapshot.runtime.connected ? t('subbot.connected') : t('subbot.noHeartbeat')}
      ariaLabel={t('subbot.navAria')}
      closeLabel={t('nav.close')}
    />
    <div className="ops-shell-content">
    <div className="mx-auto w-full max-w-[1540px] px-4 py-7 md:px-7 lg:px-9">
      <header className="flex flex-col gap-5 border-b border-white/[.07] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-5 text-blue-400"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">{t('subbot.operations')}</p><h1 className="mt-1 text-2xl font-black tracking-tight">Subbot #{subbot.id}</h1><p className="mt-1 text-xs text-zinc-600">{t('subbot.subtitle', { status: snapshot.runtime.connected ? t('subbot.connected') : t('subbot.noHeartbeat') })}</p></div></div>
        <form method="post" action="/api/auth/logout"><input type="hidden" name="_csrf" value={csrfToken}/><button className="ops-button-muted"><LogOut className="size-4"/>{t('common.logout')}</button></form>
      </header>

      {params.ok && <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/[.07] px-4 py-3 text-sm text-emerald-300">{t('subbot.ok')}</div>}
      {params.error && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">{t('subbot.error', { error: params.error })}</div>}

      {section === 'overview' && <>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{cards.map(([Icon,label,value])=><article key={label} className="ops-stat"><Icon className="size-4 text-blue-500"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-2 break-all font-bold text-zinc-100">{value}</p></article>)}</section>
        <div className="mt-6"><OperationsOverview snapshot={snapshot} platformStatuses={platformStatuses} locale={locale}/></div>
        <div className="mt-6"><OpsUsageDashboard analytics={snapshot.analytics} instanceLabel={instanceLabel} locale={locale}/></div>
      </>}

      {section === 'platforms' && <div className="mt-6">
        <PlatformsDashboard
          instanceKey={instanceKey}
          instanceLabel={instanceLabel}
          statuses={platformStatuses}
          locale={locale}
          csrfToken={csrfToken}
          canOperate={false}
          canDisable={false}
          mainRuntimeActions={false}
          baseHref={hrefFor('platforms')}
          focus={null}
          logs={null}
        />
      </div>}

      {section === 'providers' && <div className="mt-6">
        <ProvidersDashboard providers={snapshot.providers} instanceLabel={instanceLabel} locale={locale}/>
      </div>}

      {section === 'commands' && <div className="mt-6">
        <CommandCenter
          commands={snapshot.commands}
          categories={snapshot.commandCategories}
          locale={locale}
          instanceLabel={instanceLabel}
          instanceKey={instanceKey}
          csrfToken={csrfToken}
          canManage
          canManageOwnerCommands
        />
      </div>}

      {section === 'groups' && <div className="mt-6 space-y-6">
        <PlatformGroupsPanel snapshot={snapshot} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canSyncWhatsApp platformStatuses={platformStatuses} detailBasePath="/subbot/groups"/>
        <OpsConsole snapshot={snapshot} instanceLabel={instanceLabel} view="groups" locale={locale} csrfToken={csrfToken} canSyncGroups={false} canManageGroups canLeaveGroups/>
      </div>}
      {section === 'logs' ? <div className="mt-6"><RealtimeLogsDashboard initialRows={realtimeLogRows} initialCounts={realtimeLogCounts} instanceKey={instanceKey} instanceLabel={instanceLabel} locale={locale}/></div> : null}
      {section === 'jobs' ? <div className="mt-6"><JobsDashboard snapshot={jobsSnapshot} instanceKey={instanceKey} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canManage filters={jobFilters}/></div> : null}
      {section === 'audit' && <div className="mt-6"><OpsConsole snapshot={snapshot} instanceLabel={instanceLabel} view="audit" locale={locale} csrfToken={csrfToken}/></div>}

      {section === 'diagnostics' && <div className="mt-6"><DeveloperDiagnostics snapshot={snapshot} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canResetAudit/></div>}

      {section === 'account' && <div className="mt-6 space-y-6"><section className="ops-panel p-5"><div className="flex items-center gap-2 font-bold"><RefreshCcw className="size-4 text-blue-400"/>{t('subbot.resetTitle')}</div><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{t('subbot.resetText')}</p><form action="/api/control" method="post" className="mt-4"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="account"/><input type="hidden" name="action" value="reset_own_subbot"/><button className="ops-button-danger"><RefreshCcw className="size-4"/>{t('subbot.resetButton')}</button></form><p className="mt-5 text-xs text-zinc-700">{t('subbot.webSession', { date: new Date(Number(session.exp)).toLocaleString(intl) })}</p></section><SecurityCenter locale={locale}/></div>}
    </div>
    </div>
  </main>
}
