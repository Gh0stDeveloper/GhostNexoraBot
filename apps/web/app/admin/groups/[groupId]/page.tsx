import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { GroupDetailView } from '../../../../components/group-detail-view'
import { ADMIN_SESSION_COOKIE, sessionCsrfToken, verifySession } from '../../../../lib/auth'
import { readGroupDetail } from '../../../../lib/group-detail'
import { getWebLocale } from '../../../../lib/i18n-server'
import { openBotDb } from '../../../../lib/runtime'
import { hasPermission } from '../../../../lib/web-security'

export const dynamic = 'force-dynamic'

export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ instance?: string }>
}) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role === 'subbot') redirect('/login')
  if (session.mfaPending) redirect('/admin?section=security&enroll=1')
  if (!hasPermission(session.role, 'groups:view')) redirect('/admin')

  const [{ groupId }, query] = await Promise.all([params, searchParams])
  const groupJid = decodeURIComponent(groupId)
  let instanceKey = 'main'
  let scopeLabel = 'MainBot'

  if (session.role === 'owner') {
    const requested = String(query.instance ?? 'main').trim().toLowerCase()
    const match = /^subbot:(\d+)$/.exec(requested)
    if (match?.[1]) {
      const id = Number(match[1])
      const db = openBotDb()
      const exists = db
        ? Boolean(db.prepare('SELECT 1 FROM subbots WHERE id = ? LIMIT 1').get(id))
        : false
      db?.close()
      if (!exists) notFound()
      instanceKey = `subbot:${id}`
      scopeLabel = `Subbot #${id}`
    }
  }

  const detail = readGroupDetail(instanceKey, groupJid)
  if (!detail) notFound()

  const locale = await getWebLocale()
  const csrfToken = sessionCsrfToken(session)
  const backHref = `/admin?instance=${encodeURIComponent(instanceKey)}&section=groups`

  return <main className="min-h-screen bg-[#08090b] text-zinc-100">
    <GroupDetailView
      detail={detail}
      locale={locale}
      csrfToken={csrfToken}
      backHref={backHref}
      canManage={hasPermission(session.role, 'groups:manage')}
      canLeave={hasPermission(session.role, 'groups:leave')}
      scopeLabel={scopeLabel}
    />
  </main>
}
