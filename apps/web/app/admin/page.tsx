import { Bot, Coins, Download, Gauge, LayoutDashboard, LogOut, MessageSquare, RefreshCcw, Send, Settings, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OpsConsole } from '../../components/ops-console'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../lib/auth'
import { getWebLocale } from '../../lib/i18n-server'
import { webIntlLocale, webT } from '../../lib/i18n'
import { readOpsSnapshot } from '../../lib/ops'
import { openBotDb } from '../../lib/runtime'

export const dynamic = 'force-dynamic'
type Subbot = { id: number; ownerJid: string; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }
type AdminSection = 'overview' | 'groups' | 'audit' | 'management' | 'subbots'
const sectionIds: AdminSection[] = ['overview', 'groups', 'audit', 'management', 'subbots']

function normalizeSection(value?: string): AdminSection {
  return sectionIds.includes(value as AdminSection) ? value as AdminSection : 'overview'
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; instance?: string; section?: string }> }) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'admin') redirect('/login?mode=admin')
  const locale = await getWebLocale()
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const sections: Array<[AdminSection, string, typeof Bot]> = [
    ['overview', t('nav.overview'), LayoutDashboard],
    ['groups', t('nav.groups'), UsersRound],
    ['audit', t('nav.audit'), Gauge],
    ['management', t('nav.management'), Settings],
    ['subbots', t('nav.subbots'), Bot],
  ]
  const params = await searchParams
  const section = normalizeSection(params.section)
  const db = openBotDb()
  const subbots = db ? db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as unknown as Subbot[] : []
  const users = db ? Number((db.prepare('SELECT COUNT(*) as count FROM economy_users').get() as { count: number } | undefined)?.count ?? 0) : 0
  const totalMessages = subbots.reduce((sum, item) => sum + Number(item.messagesProcessed), 0)
  const totalBytes = subbots.reduce((sum, item) => sum + Number(item.downloadBytes), 0)
  db?.close()

  const requestedInstance = String(params.instance ?? 'main')
  const validSubbotIds = new Set(subbots.map((item) => item.id))
  const match = /^subbot:(\d+)$/.exec(requestedInstance)
  const selectedInstance = match?.[1] && validSubbotIds.has(Number(match[1])) ? `subbot:${Number(match[1])}` : 'main'
  const selectedSubbot = selectedInstance === 'main' ? null : subbots.find((item) => item.id === Number(selectedInstance.split(':')[1])) ?? null
  const instanceLabel = selectedSubbot ? `Subbot #${selectedSubbot.id}${selectedSubbot.phone ? ` · ${selectedSubbot.phone}` : ''}` : 'MainBot'
  const snapshot = readOpsSnapshot(selectedInstance)
  const hrefFor = (target: AdminSection) => `/admin?instance=${encodeURIComponent(selectedInstance)}&section=${target}`
  const refreshHref = hrefFor(section)
  const runtimeStatus = snapshot.runtime.connected ? t('admin.connected') : snapshot.runtime.registered ? t('admin.linkedNoHeartbeat') : t('admin.notLinked')

  return <main className="ops-page">
    <div className="mx-auto w-full max-w-[1540px] px-4 py-7 md:px-7 lg:px-9">
      <header className="flex flex-col gap-5 border-b border-white/[.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><ShieldCheck className="size-5 text-blue-400"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">Operations Center</p><h1 className="mt-1 text-2xl font-black tracking-tight text-white">{t('admin.title')}</h1><p className="mt-1 text-xs text-zinc-600">{t('admin.currentView', { instance: instanceLabel, status: runtimeStatus })}</p></div></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form method="get" className="flex gap-2"><input type="hidden" name="section" value={section}/><select name="instance" defaultValue={selectedInstance} className="ops-input min-w-56"><option value="main">MainBot</option>{subbots.map((item)=><option key={item.id} value={`subbot:${item.id}`}>Subbot #{item.id} · {item.phone ?? t('common.unlinked')}</option>)}</select><button className="ops-button-primary">{t('admin.open')}</button></form>
          <form method="post" action="/api/auth/logout"><button className="ops-button-muted h-full"><LogOut className="size-4"/>{t('common.logout')}</button></form>
        </div>
      </header>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label={t('admin.navAria')}>
        {sections.map(([id, label, Icon]) => <a key={id} href={hrefFor(id)} className={section === id ? 'ops-tab-active' : 'ops-tab'}><Icon className="size-4"/>{label}</a>)}
      </nav>

      {params.ok && <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/[.07] px-4 py-3 text-sm text-emerald-300">{t('admin.ok')}</div>}
      {params.error && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">{t('admin.error', { error: params.error })}</div>}

      {section === 'overview' && <>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[[Bot,t('admin.stat.subbots'),subbots.length],[MessageSquare,t('admin.stat.online'),subbots.filter((s)=>s.status==='online').length],[MessageSquare,t('admin.stat.messages'),totalMessages],[ShieldCheck,t('admin.stat.users'),users],[UsersRound,t('admin.stat.groups'),snapshot.groups.length]].map(([Icon,label,value])=>{const I=Icon as typeof Bot;return <article key={String(label)} className="ops-stat"><I className="size-4 text-blue-500"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{String(label)}</p><p className="mt-2 text-2xl font-black text-white">{Number(value).toLocaleString(intl)}</p></article>})}
        </section>
        <p className="mt-3 text-xs text-zinc-600"><Download className="mr-2 inline size-3.5"/>{t('admin.traffic', { size: (totalBytes/1024/1024/1024).toFixed(2), heartbeat: snapshot.runtime.updatedAt ? new Date(snapshot.runtime.updatedAt).toLocaleString(intl) : t('common.noData') })}</p>
        <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={refreshHref} instanceLabel={instanceLabel} view="overview" locale={locale}/></div>
      </>}

      {section === 'groups' && <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={refreshHref} instanceLabel={instanceLabel} view="groups" locale={locale}/></div>}
      {section === 'audit' && <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={refreshHref} instanceLabel={instanceLabel} view="audit" locale={locale}/></div>}

      {section === 'management' && <section className="mt-6 ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold text-white">{t('admin.globalTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('admin.globalText')}</p></div>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="add_nxc"/><div className="flex items-center gap-2 font-bold"><Coins className="size-4 text-blue-400"/>{t('admin.nxcTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.nxcText')}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><input className="ops-input" name="amount" type="number" min="1" placeholder="5000" required/></div><button className="ops-button-primary mt-3"><Coins className="size-4"/>{t('admin.credit')}</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="grant_subbot"/><div className="flex items-center gap-2 font-bold"><UserPlus className="size-4 text-blue-400"/>{t('admin.grantTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.grantText')}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><select className="ops-input" name="duration"><option value="1d">{t('admin.oneDay')}</option><option value="7d">{t('admin.sevenDays')}</option><option value="30d">{t('admin.thirtyDays')}</option><option value="permanent">{t('admin.permanent')}</option></select></div><button className="ops-button-primary mt-3"><Bot className="size-4"/>{t('admin.grant')}</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="reset_subbot"/><div className="flex items-center gap-2 font-bold"><RefreshCcw className="size-4 text-blue-400"/>{t('admin.resetTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.resetText')}</p><input className="ops-input mt-4" name="id" type="number" min="1" placeholder={t('admin.subbotId')} required/><button className="ops-button-primary mt-3"><RefreshCcw className="size-4"/>{t('common.reset')}</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="section" value="management"/><input type="hidden" name="action" value="broadcast"/><div className="flex items-center gap-2 font-bold"><Send className="size-4 text-blue-400"/>{t('admin.broadcastTitle')}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t('admin.broadcastText')}</p><textarea className="ops-input mt-4 min-h-24" name="message" maxLength={5000} placeholder={t('admin.broadcastPlaceholder')} required/><button className="ops-button-primary mt-3"><Send className="size-4"/>{t('common.send')}</button></form>
        </div>
      </section>}

      {section === 'subbots' && <section className="mt-6 ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold">{t('admin.instancesTitle')}</h2><p className="mt-1 text-xs text-zinc-500">{t('admin.instancesText')}</p></div>
        <div className="overflow-x-auto"><table className="ops-table min-w-[980px]"><thead><tr><th>ID</th><th>{t('admin.table.number')}</th><th>{t('admin.table.owner')}</th><th>{t('admin.table.status')}</th><th>{t('admin.table.messages')}</th><th>{t('admin.table.traffic')}</th><th>{t('admin.table.expires')}</th></tr></thead><tbody>{subbots.length ? subbots.map((item)=><tr key={item.id}><td className="font-mono font-bold text-blue-400">#{item.id}</td><td>{item.phone??t('common.unlinked')}</td><td className="max-w-72 truncate font-mono text-xs text-zinc-500">{item.ownerJid}</td><td><span className={item.status==='online'?'ops-badge-good':item.status==='pending'?'ops-badge-warn':'ops-badge-bad'}>{item.status.toUpperCase()}</span></td><td className="font-mono">{Number(item.messagesProcessed).toLocaleString(intl)}</td><td className="font-mono">{(Number(item.downloadBytes)/1024/1024).toFixed(1)} MB</td><td className="text-zinc-500">{new Date(Number(item.expiresAt)).toLocaleString(intl)}</td></tr>):<tr><td colSpan={7} className="py-10 text-center text-zinc-500">{t('admin.noSubbots')}</td></tr>}</tbody></table></div>
      </section>}
    </div>
  </main>
}
