import { Activity, Bot, Coins, Download, Fingerprint, Gauge, LayoutDashboard, LogOut, MessageSquare, RefreshCcw, Send, ServerCog, Settings, ShieldCheck, SquareTerminal, UserPlus, UsersRound, Wrench } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BackupPanel } from '../../components/backup-panel'
import { CommandCenter } from '../../components/command-center'
import { DeveloperDiagnostics } from '../../components/developer-diagnostics'
import { EconomyLedgerDashboard } from '../../components/economy-ledger-dashboard'
import { JobsDashboard } from '../../components/jobs-dashboard'
import { OperationsOverview } from '../../components/operations-overview'
import { OpsToast } from '../../components/ops-client-controls'
import { OpsConsole } from '../../components/ops-console'
import { OpsUsageDashboard } from '../../components/ops-usage-dashboard'
import { PlatformGroupsPanel } from '../../components/platform-groups-panel'
import { PlatformsDashboard } from '../../components/platforms-dashboard'
import { ProvidersDashboard } from '../../components/providers-dashboard'
import { RealtimeLogsDashboard } from '../../components/realtime-logs-dashboard'
import { SecurityCenter } from '../../components/security-center'
import { UnifiedNavigation, type UnifiedNavIcon, type UnifiedNavItem } from '../../components/unified-navigation'
import { UserDashboard } from '../../components/user-dashboard'
import { UpdateDashboard } from '../../components/update-dashboard'
import { ADMIN_SESSION_COOKIE, sessionCsrfToken, verifySession } from '../../lib/auth'
import { readEconomyLedger } from '../../lib/economy-ledger'
import { getWebLocale } from '../../lib/i18n-server'
import { webIntlLocale, webT } from '../../lib/i18n'
import { readOpsSnapshot } from '../../lib/ops'
import { readOpsJobs } from '../../lib/ops-jobs'
import { readOpsRuntimeLogCounts, readOpsRuntimeLogs } from '../../lib/ops-observability'
import { readMainPlatformStatuses, subbotPlatformStatuses, type WebPlatformId } from '../../lib/platform-status'
import { openBotDb } from '../../lib/runtime'
import { readUserDashboardDetail, searchUserDashboard } from '../../lib/user-dashboard'
import { readUpdateDashboard } from '../../lib/update-dashboard'
import { hasPermission, roleLabel, type PrivilegedWebRole } from '../../lib/web-security'

export const dynamic = 'force-dynamic'

type Subbot = {
  id: number
  ownerJid: string
  phone: string | null
  status: string
  expiresAt: number
  messagesProcessed: number
  downloadBytes: number
}

type AdminSection = 'overview' | 'platforms' | 'providers' | 'commands' | 'groups' | 'users' | 'economy' | 'logs' | 'jobs' | 'updates' | 'audit' | 'diagnostics' | 'management' | 'subbots' | 'security'

function availableSections(role: PrivilegedWebRole, t: (key: Parameters<typeof webT>[1]) => string) {
  const base: Array<[AdminSection, string, typeof Bot]> = [
    ['overview', t('nav.overview'), LayoutDashboard],
    ['platforms', t('nav.platforms'), Activity],
    ['providers', t('nav.providers'), ServerCog],
    ['commands', t('nav.commands'), SquareTerminal],
    ['groups', t('nav.groups'), UsersRound],
    ['users', t('nav.users'), UsersRound],
    ...(role === 'owner' ? [['economy', t('nav.economy'), Coins] as [AdminSection, string, typeof Bot]] : []),
    ['logs', t('nav.logs'), SquareTerminal],
    ['jobs', t('nav.jobs'), Activity],
    ...(role === 'owner' ? [['updates', t('nav.updates'), RefreshCcw] as [AdminSection, string, typeof Bot]] : []),
    ['audit', t('nav.audit'), Gauge],
    ['diagnostics', t('nav.diagnostics'), Wrench],
  ]
  if (role === 'owner') {
    base.push(['management', t('nav.management'), Settings], ['subbots', t('nav.subbots'), Bot])
  }
  base.push(['security', t('nav.security'), Fingerprint])
  return base
}

function normalizeSection(value: string | undefined, role: PrivilegedWebRole): AdminSection {
  const allowed: AdminSection[] = role === 'owner'
    ? ['overview', 'platforms', 'providers', 'commands', 'groups', 'users', 'economy', 'logs', 'jobs', 'updates', 'audit', 'diagnostics', 'management', 'subbots', 'security']
    : ['overview', 'platforms', 'providers', 'commands', 'groups', 'users', 'logs', 'jobs', 'audit', 'diagnostics', 'security']
  return allowed.includes(value as AdminSection) ? value as AdminSection : 'overview'
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; instance?: string; section?: string; focus?: string; logs?: string; q?: string; user?: string; ledgerUser?: string; ledgerKind?: string; ledgerSource?: string; ledgerDays?: string; jobQ?: string; jobStatus?: string; jobType?: string }> }) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role === 'subbot') redirect('/login')

  const role = session.role
  const csrfToken = sessionCsrfToken(session)
  const locale = await getWebLocale()
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const sections = availableSections(role, (key) => t(key))
  const params = await searchParams
  if (session.mfaPending && params.section !== 'security') redirect('/admin?section=security&enroll=1')
  const section = normalizeSection(params.section, role)

  const db = openBotDb()
  const subbots = role === 'owner' && db
    ? db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as unknown as Subbot[]
    : []
  const subbotCount = db ? Number((db.prepare('SELECT COUNT(*) as count FROM subbots').get() as { count?: number } | undefined)?.count ?? 0) : 0
  const users = db ? Number((db.prepare('SELECT COUNT(*) as count FROM economy_users').get() as { count?: number } | undefined)?.count ?? 0) : 0
  const totalMessages = role === 'owner' ? subbots.reduce((sum, item) => sum + Number(item.messagesProcessed), 0) : 0
  const totalBytes = role === 'owner' ? subbots.reduce((sum, item) => sum + Number(item.downloadBytes), 0) : 0
  db?.close()

  const requestedInstance = role === 'owner' && section !== 'updates' ? String(params.instance ?? 'main') : 'main'
  const validSubbotIds = new Set(subbots.map((item) => item.id))
  const match = /^subbot:(\d+)$/.exec(requestedInstance)
  const selectedInstance = role === 'owner' && match?.[1] && validSubbotIds.has(Number(match[1]))
    ? `subbot:${Number(match[1])}`
    : 'main'
  const selectedSubbot = selectedInstance === 'main' ? null : subbots.find((item) => item.id === Number(selectedInstance.split(':')[1])) ?? null
  const instanceLabel = selectedSubbot ? `Subbot #${selectedSubbot.id}${selectedSubbot.phone ? ` · ${selectedSubbot.phone}` : ''}` : 'MainBot'
  const snapshot = readOpsSnapshot(selectedInstance)
  const platformStatuses = selectedInstance === 'main'
    ? await readMainPlatformStatuses(snapshot.runtime)
    : subbotPlatformStatuses(snapshot.runtime)
  const hrefFor = (target: AdminSection) => `/admin?instance=${encodeURIComponent(selectedInstance)}&section=${target}`
  const runtimeStatus = snapshot.runtime.connected ? t('admin.connected') : snapshot.runtime.registered ? t('admin.linkedNoHeartbeat') : t('admin.notLinked')

  const canSyncGroups = hasPermission(role, 'groups:sync')
  const canOperatePlatforms = hasPermission(role, 'platforms:operate')
  const canDisablePlatforms = hasPermission(role, 'platforms:disable')
  const safePlatform = (value: string | undefined): WebPlatformId | null =>
    value === 'whatsapp' || value === 'discord' || value === 'telegram' ? value : null
  const focusedPlatform = safePlatform(params.focus)
  const logsPlatform = safePlatform(params.logs)
  const canManageGroups = hasPermission(role, 'groups:manage')
  const canLeaveGroups = hasPermission(role, 'groups:leave')
  const canResetAudit = hasPermission(role, 'audit:reset')
  const canManageCommands = hasPermission(role, 'commands:manage')
  const canViewLedger = hasPermission(role, 'economy:ledger')
  const canViewLogs = hasPermission(role, 'logs:view')
  const canViewJobs = hasPermission(role, 'jobs:view')
  const canManageJobs = hasPermission(role, 'jobs:manage')
  const canViewUpdates = hasPermission(role, 'updates:view')
  const canManageUpdates = hasPermission(role, 'updates:manage')
  const canViewUsers = hasPermission(role, 'users:view')
  const userPermissions = {
    financial: hasPermission(role, 'users:financial'),
    moderation: hasPermission(role, 'users:moderation'),
    subbots: hasPermission(role, 'users:subbots'),
  }
  const userQuery = section === 'users' ? String(params.q ?? '').trim().slice(0, 120) : ''
  const userRows = section === 'users' && canViewUsers
    ? searchUserDashboard(selectedInstance, userQuery, userPermissions)
    : []
  const selectedUserJid = section === 'users' ? String(params.user ?? '').trim().slice(0, 180) : ''
  const userDetail = section === 'users' && canViewUsers && selectedUserJid
    ? readUserDashboardDetail(selectedInstance, selectedUserJid, userPermissions)
    : null
  const ledgerDaysRaw = Number(params.ledgerDays ?? 7)
  const ledgerFilters = {
    user: section === 'economy' ? String(params.ledgerUser ?? '').trim().slice(0, 160) : '',
    kind: section === 'economy' ? String(params.ledgerKind ?? '').trim().slice(0, 80) : '',
    source: section === 'economy' ? String(params.ledgerSource ?? '').trim().slice(0, 80) : '',
    days: [1, 7, 30, 90].includes(ledgerDaysRaw) ? ledgerDaysRaw : 7,
  }
  const ledgerSnapshot = section === 'economy' && canViewLedger
    ? readEconomyLedger({ instanceKey: selectedInstance, ...ledgerFilters, limit: 250 })
    : null
  const realtimeLogRows = section === 'logs' && canViewLogs ? readOpsRuntimeLogs(selectedInstance, 200) : []
  const realtimeLogCounts = section === 'logs' && canViewLogs
    ? readOpsRuntimeLogCounts(selectedInstance)
    : { total: 0, errors: 0, warnings: 0, commands: 0, api: 0, downloads: 0 }
  const jobFilters = {
    query: section === 'jobs' ? String(params.jobQ ?? '').trim().slice(0, 100) : '',
    status: section === 'jobs' ? String(params.jobStatus ?? '').trim().toLowerCase() : '',
    type: section === 'jobs' ? String(params.jobType ?? '').trim().toLowerCase() : '',
  }
  const jobsSnapshot = section === 'jobs' && canViewJobs
    ? readOpsJobs(selectedInstance, { ...jobFilters, limit: 250 })
    : { rows: [], counts: { active: 0, waiting: 0, running: 0, completed: 0, failed: 0, cancelled: 0 } }
  const updateSnapshot = section === 'updates' && canViewUpdates
    ? await readUpdateDashboard()
    : null
  const navIcon: Record<AdminSection, UnifiedNavIcon> = {
    overview: 'dashboard',
    platforms: 'platforms',
    providers: 'providers',
    commands: 'commands',
    groups: 'groups',
    users: 'users',
    economy: 'economy',
    logs: 'logs',
    jobs: 'jobs',
    updates: 'updates',
    audit: 'audit',
    diagnostics: 'diagnostics',
    management: 'settings',
    subbots: 'subbots',
    security: 'security',
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
      brandSubtitle={t('admin.title')}
      brandHref={hrefFor('overview')}
      badge={roleLabel(role)}
      ariaLabel={t('admin.navAria')}
      closeLabel={t('nav.close')}
    />
    <div className="ops-shell-content">
    <div className="ops-page-frame">
      <header className="ops-page-header">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><ShieldCheck className="size-5 text-blue-400"/></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">{sections.find(([id]) => id === section)?.[1] ?? t('admin.title')}</p><span className="ops-badge-good">{roleLabel(role)}</span></div>
            <h1 className="ops-page-title mt-1">{t('admin.title')}</h1>
            <p className="ops-page-subtitle">{t('admin.currentView', { instance: instanceLabel, status: runtimeStatus })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {role === 'owner' ? <form method="get" className="flex gap-2">
            <input type="hidden" name="section" value={section}/>
            <select name="instance" defaultValue={selectedInstance} className="ops-input min-w-56">
              <option value="main">MainBot</option>
              {subbots.map((item) => <option key={item.id} value={`subbot:${item.id}`}>Subbot #{item.id} · {item.phone ?? t('common.unlinked')}</option>)}
            </select>
            <button className="ops-button-primary">{t('admin.open')}</button>
          </form> : null}
          <form method="post" action="/api/auth/logout">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <button className="ops-button-muted h-full"><LogOut className="size-4"/>{t('common.logout')}</button>
          </form>
        </div>
      </header>

      {params.ok ? <OpsToast tone="success">{t('admin.ok')}</OpsToast> : null}
      {params.error ? <OpsToast tone="error">{t('admin.error', { error: params.error })}</OpsToast> : null}

      {section === 'overview' && <>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            [Bot, t('admin.stat.subbots'), subbotCount],
            [MessageSquare, t('admin.stat.online'), role === 'owner' ? subbots.filter((s) => s.status === 'online').length : 0],
            [MessageSquare, t('admin.stat.messages'), totalMessages],
            [ShieldCheck, t('admin.stat.users'), users],
            [UsersRound, t('admin.stat.groups'), snapshot.platformGroups.length || snapshot.groups.length],
            [Activity, t('admin.stat.platforms'), platformStatuses.filter((item) => item.connected).length],
          ].map(([Icon, label, value]) => {
            const I = Icon as typeof Bot
            return <article key={String(label)} className="ops-stat"><I className="size-4 text-blue-500"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{String(label)}</p><p className="mt-2 text-2xl font-black text-white">{Number(value).toLocaleString(intl)}</p></article>
          })}
        </section>
        {role === 'owner' ? <p className="mt-3 text-xs text-zinc-600"><Download className="mr-2 inline size-3.5"/>{t('admin.traffic', { size: (totalBytes / 1024 / 1024 / 1024).toFixed(2), heartbeat: snapshot.runtime.updatedAt ? new Date(snapshot.runtime.updatedAt).toLocaleString(intl) : t('common.noData') })}</p> : null}
        <div className="mt-6"><OperationsOverview snapshot={snapshot} platformStatuses={platformStatuses} locale={locale}/></div>
        <div className="mt-6"><OpsUsageDashboard analytics={snapshot.analytics} instanceLabel={instanceLabel} locale={locale}/></div>
      </>}

      {section === 'platforms' && <div className="mt-6">
        <PlatformsDashboard
          instanceKey={selectedInstance}
          instanceLabel={instanceLabel}
          statuses={platformStatuses}
          locale={locale}
          csrfToken={csrfToken}
          canOperate={canOperatePlatforms}
          canDisable={canDisablePlatforms}
          mainRuntimeActions={selectedInstance === 'main'}
          baseHref={hrefFor('platforms')}
          focus={focusedPlatform}
          logs={logsPlatform}
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
          instanceKey={selectedInstance}
          csrfToken={csrfToken}
          canManage={canManageCommands}
          canManageOwnerCommands={role === 'owner'}
        />
      </div>}

      {section === 'groups' && <div className="mt-6 space-y-6">
        <PlatformGroupsPanel snapshot={snapshot} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canSyncWhatsApp={canSyncGroups} platformStatuses={platformStatuses} detailBasePath="/admin/groups"/>
        <OpsConsole snapshot={snapshot} instanceLabel={instanceLabel} view="groups" locale={locale} csrfToken={csrfToken} canSyncGroups={false} canManageGroups={canManageGroups} canLeaveGroups={canLeaveGroups}/>
      </div>}
      {section === 'users' && canViewUsers ? <div className="mt-6"><UserDashboard rows={userRows} detail={userDetail} query={userQuery} instanceKey={selectedInstance} instanceLabel={instanceLabel} locale={locale} permissions={userPermissions}/></div> : null}
      {section === 'economy' && canViewLedger && ledgerSnapshot ? <div className="mt-6"><EconomyLedgerDashboard snapshot={ledgerSnapshot} instanceKey={selectedInstance} instanceLabel={instanceLabel} locale={locale} filters={ledgerFilters}/></div> : null}
      {section === 'logs' && canViewLogs ? <div className="mt-6"><RealtimeLogsDashboard initialRows={realtimeLogRows} initialCounts={realtimeLogCounts} instanceKey={selectedInstance} instanceLabel={instanceLabel} locale={locale}/></div> : null}
      {section === 'jobs' && canViewJobs ? <div className="mt-6"><JobsDashboard snapshot={jobsSnapshot} instanceKey={selectedInstance} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canManage={canManageJobs} filters={jobFilters}/></div> : null}
      {section === 'updates' && canViewUpdates && updateSnapshot ? <div className="mt-6"><UpdateDashboard snapshot={updateSnapshot} locale={locale} csrfToken={csrfToken} canManage={canManageUpdates}/></div> : null}
      {section === 'audit' && <div className="mt-6"><OpsConsole snapshot={snapshot} instanceLabel={instanceLabel} view="audit" locale={locale} csrfToken={csrfToken}/></div>}

      {section === 'diagnostics' && <div className="mt-6"><DeveloperDiagnostics snapshot={snapshot} instanceLabel={instanceLabel} locale={locale} csrfToken={csrfToken} canResetAudit={canResetAudit}/></div>}

      {role === 'owner' && section === 'management' ? <div className="mt-6 space-y-6">
        <section className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold text-white">{t('admin.globalTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('admin.globalText')}</p></div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="add_nxc"/><div className="flex items-center gap-2 font-bold"><Coins className="size-4 text-blue-400"/>{t('admin.nxcTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.nxcText')}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><input className="ops-input" name="amount" type="number" min="1" placeholder="5000" required/></div><button className="ops-button-primary mt-3"><Coins className="size-4"/>{t('admin.credit')}</button></form>
            <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="grant_subbot"/><div className="flex items-center gap-2 font-bold"><UserPlus className="size-4 text-blue-400"/>{t('admin.grantTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.grantText')}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><select className="ops-input" name="duration"><option value="1d">{t('admin.oneDay')}</option><option value="7d">{t('admin.sevenDays')}</option><option value="30d">{t('admin.thirtyDays')}</option><option value="permanent">{t('admin.permanent')}</option></select></div><button className="ops-button-primary mt-3"><Bot className="size-4"/>{t('admin.grant')}</button></form>
            <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="reset_subbot"/><div className="flex items-center gap-2 font-bold"><RefreshCcw className="size-4 text-blue-400"/>{t('admin.resetTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.resetText')}</p><input className="ops-input mt-4" name="id" type="number" min="1" placeholder={t('admin.subbotId')} required/><button className="ops-button-primary mt-3"><RefreshCcw className="size-4"/>{t('common.reset')}</button></form>
            <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="broadcast"/><div className="flex items-center gap-2 font-bold"><Send className="size-4 text-blue-400"/>{t('admin.broadcastTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.broadcastText')}</p><textarea className="ops-input mt-4 min-h-24" name="message" maxLength={5000} placeholder={t('admin.broadcastPlaceholder')} required/><button className="ops-button-primary mt-3"><Send className="size-4"/>{t('common.send')}</button></form>
          </div>
        </section>
        <BackupPanel locale={locale} csrfToken={csrfToken}/>
      </div> : null}

      {role === 'owner' && section === 'subbots' ? <section className="mt-6 ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold">{t('admin.instancesTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('admin.instancesText')}</p></div>
        <div className="overflow-x-auto"><table className="ops-table min-w-[980px]"><thead><tr><th>ID</th><th>{t('admin.table.number')}</th><th>{t('admin.table.owner')}</th><th>{t('admin.table.status')}</th><th>{t('admin.table.messages')}</th><th>{t('admin.table.traffic')}</th><th>{t('admin.table.expires')}</th></tr></thead><tbody>{subbots.length ? subbots.map((item) => <tr key={item.id}><td className="font-mono font-bold text-blue-400">#{item.id}</td><td>{item.phone ?? t('common.unlinked')}</td><td className="max-w-72 truncate font-mono text-xs text-zinc-500">{item.ownerJid}</td><td><span className={item.status === 'online' ? 'ops-badge-good' : item.status === 'pending' ? 'ops-badge-warn' : 'ops-badge-bad'}>{item.status.toUpperCase()}</span></td><td className="font-mono">{Number(item.messagesProcessed).toLocaleString(intl)}</td><td className="font-mono">{(Number(item.downloadBytes) / 1024 / 1024).toFixed(1)} MB</td><td className="text-zinc-500">{new Date(Number(item.expiresAt)).toLocaleString(intl)}</td></tr>) : <tr><td colSpan={7} className="py-10 text-center text-zinc-500">{t('admin.noSubbots')}</td></tr>}</tbody></table></div>
      </section> : null}

      {section === 'security' ? <div className="mt-6"><SecurityCenter locale={locale}/></div> : null}
    </div>
    </div>
  </main>
}
