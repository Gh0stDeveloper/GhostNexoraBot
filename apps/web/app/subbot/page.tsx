import { Bot, Clock3, Download, Gauge, LayoutDashboard, LogOut, RefreshCcw, Settings, Smartphone, UsersRound } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OpsConsole } from '../../components/ops-console'
import { SUBBOT_SESSION_COOKIE, verifySession } from '../../lib/auth'
import { getWebLocale } from '../../lib/i18n-server'
import { webIntlLocale, webT } from '../../lib/i18n'
import { readOpsSnapshot } from '../../lib/ops'
import { openBotDb } from '../../lib/runtime'

export const dynamic = 'force-dynamic'
type SubbotRow = { id: number; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }
type SubbotSection = 'overview' | 'groups' | 'audit' | 'account'
const sectionIds: SubbotSection[] = ['overview', 'groups', 'audit', 'account']

function normalizeSection(value?: string): SubbotSection {
  return sectionIds.includes(value as SubbotSection) ? value as SubbotSection : 'overview'
}

export default async function SubbotPortal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; section?: string }> }) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'subbot') redirect('/login?mode=subbot')
  const locale = await getWebLocale()
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const sections: Array<[SubbotSection, string, typeof Bot]> = [
    ['overview', t('nav.overview'), LayoutDashboard],
    ['groups', t('nav.groups'), UsersRound],
    ['audit', t('nav.audit'), Gauge],
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
  const labels: Record<string,string> = {
    pending: t('subbot.pending'), pairing: t('subbot.pairing'), online: t('common.online'), offline: t('subbot.offline'), logged_out: t('subbot.loggedOut'), revoked: t('subbot.revoked'),
  }
  const cards = [[Smartphone,t('subbot.number'),subbot.phone??t('common.unlinked')],[Bot,t('subbot.runtime'),snapshot.runtime.connected?t('admin.connected'):labels[subbot.status]??subbot.status],[Clock3,t('subbot.subscription'),new Date(Number(subbot.expiresAt)).toLocaleString(intl)],[UsersRound,t('subbot.groups'),snapshot.groups.length.toLocaleString(intl)],[Download,t('subbot.downloads'),`${(Number(subbot.downloadBytes)/1024/1024).toFixed(1)} MB`]] as const
  const hrefFor = (target: SubbotSection) => `/subbot?section=${target}`

  return <main className="ops-page">
    <div className="mx-auto w-full max-w-[1540px] px-4 py-7 md:px-7 lg:px-9">
      <header className="flex flex-col gap-5 border-b border-white/[.07] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-5 text-blue-400"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">{t('subbot.operations')}</p><h1 className="mt-1 text-2xl font-black tracking-tight">Subbot #{subbot.id}</h1><p className="mt-1 text-xs text-zinc-600">{t('subbot.subtitle', { status: snapshot.runtime.connected ? t('subbot.connected') : t('subbot.noHeartbeat') })}</p></div></div>
        <form method="post" action="/api/auth/logout"><button className="ops-button-muted"><LogOut className="size-4"/>{t('common.logout')}</button></form>
      </header>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label={t('subbot.navAria')}>
        {sections.map(([id,label,Icon])=><a key={id} href={hrefFor(id)} className={section===id?'ops-tab-active':'ops-tab'}><Icon className="size-4"/>{label}</a>)}
      </nav>

      {params.ok && <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/[.07] px-4 py-3 text-sm text-emerald-300">{t('subbot.ok')}</div>}
      {params.error && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">{t('subbot.error', { error: params.error })}</div>}

      {section === 'overview' && <>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([Icon,label,value])=><article key={label} className="ops-stat"><Icon className="size-4 text-blue-500"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-2 break-all font-bold text-zinc-100">{value}</p></article>)}</section>
        <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={hrefFor('overview')} instanceLabel={`Subbot #${subbot.id}`} view="overview" locale={locale}/></div>
      </>}

      {section === 'groups' && <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={hrefFor('groups')} instanceLabel={`Subbot #${subbot.id}`} view="groups" locale={locale}/></div>}
      {section === 'audit' && <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={hrefFor('audit')} instanceLabel={`Subbot #${subbot.id}`} view="audit" locale={locale}/></div>}

      {section === 'account' && <section className="mt-6 ops-panel p-5"><div className="flex items-center gap-2 font-bold"><RefreshCcw className="size-4 text-blue-400"/>{t('subbot.resetTitle')}</div><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{t('subbot.resetText')}</p><form action="/api/control" method="post" className="mt-4"><input type="hidden" name="section" value="account"/><input type="hidden" name="action" value="reset_own_subbot"/><button className="ops-button-danger"><RefreshCcw className="size-4"/>{t('subbot.resetButton')}</button></form><p className="mt-5 text-xs text-zinc-700">{t('subbot.webSession', { date: new Date(Number(session.exp)).toLocaleString(intl) })}</p></section>}
    </div>
  </main>
}
