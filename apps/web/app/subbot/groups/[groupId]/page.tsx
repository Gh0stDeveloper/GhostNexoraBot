import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { GroupDetailView } from '../../../../components/group-detail-view'
import { SUBBOT_SESSION_COOKIE, sessionCsrfToken, verifySession } from '../../../../lib/auth'
import { readGroupDetail } from '../../../../lib/group-detail'
import { getWebLocale } from '../../../../lib/i18n-server'
import { openBotDb } from '../../../../lib/runtime'
import { hasPermission } from '../../../../lib/web-security'

export const dynamic = 'force-dynamic'

export default async function SubbotGroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'subbot') redirect('/login?mode=subbot')

  const db = openBotDb()
  const active = db
    ? Boolean(db.prepare('SELECT 1 FROM subbots WHERE id = ? AND expires_at > ? LIMIT 1').get(session.subbotId, Date.now()))
    : false
  db?.close()
  if (!active) redirect('/login?mode=subbot&error=invalid')

  const { groupId } = await params
  const groupJid = decodeURIComponent(groupId)
  const instanceKey = `subbot:${session.subbotId}`
  const detail = readGroupDetail(instanceKey, groupJid)
  if (!detail) notFound()

  const locale = await getWebLocale()
  const csrfToken = sessionCsrfToken(session)

  return <main className="min-h-screen bg-[#08090b] text-zinc-100">
    <GroupDetailView
      detail={detail}
      locale={locale}
      csrfToken={csrfToken}
      backHref="/subbot?section=groups"
      canManage={hasPermission(session.role, 'groups:manage')}
      canLeave={hasPermission(session.role, 'groups:leave')}
      scopeLabel={`Subbot #${session.subbotId}`}
    />
  </main>
}
