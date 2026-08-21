import { Bot, Clock3, Download, LogOut, MessageSquare, Smartphone } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { openBotDb } from '../../lib/runtime'
import { SUBBOT_SESSION_COOKIE, verifySession } from '../../lib/auth'

export const dynamic = 'force-dynamic'

type SubbotRow = { id: number; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function SubbotPortal() {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'subbot') redirect('/login?mode=subbot')

  const db = openBotDb()
  if (!db) return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">Panel no disponible</h1><p className="mt-3 text-zinc-400">La base de datos del bot todavía no está disponible para la web.</p></main>
  const subbot = db.prepare(`SELECT id, phone, status, expires_at as expiresAt,
    messages_processed as messagesProcessed, download_bytes as downloadBytes
    FROM subbots WHERE id = ? AND owner_jid = ? AND expires_at > ?`)
    .get(session.subbotId, session.userJid, Date.now()) as SubbotRow | undefined
  db.close()
  if (!subbot) redirect('/login?mode=subbot&error=invalid')

  const cards = [
    [Smartphone, 'Número', subbot.phone ?? 'Sin vincular'], [Bot, 'Estado', subbot.status],
    [Clock3, 'Suscripción', new Date(Number(subbot.expiresAt)).toLocaleString('es-MX')],
    [MessageSquare, 'Mensajes', Number(subbot.messagesProcessed).toLocaleString()],
    [Download, 'Descargas', `${(Number(subbot.downloadBytes) / 1024 / 1024).toFixed(1)} MB`],
  ] as const

  return <main className="mx-auto w-full max-w-5xl px-5 py-14 md:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-sm font-medium text-[var(--accent)]">Portal privado</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Subbot #{subbot.id}</h1><p className="mt-3 max-w-2xl text-zinc-400">Esta sesión solo puede consultar tu instancia. No expone otros subbots, owners ni tokens administrativos.</p></div>
      <form method="post" action="/api/auth/logout"><button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[.08] hover:text-white"><LogOut className="size-4"/>Cerrar sesión</button></form>
    </div>
    <div className="mt-6 rounded-2xl border border-emerald-300/10 bg-emerald-400/[.04] px-5 py-4 text-sm text-zinc-400">Acceso validado mediante token de portal y convertido en una cookie HttpOnly firmada. El token no permanece en la URL.</div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([Icon, label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><Icon className="size-5 text-[var(--accent)]"/><p className="mt-4 text-sm text-zinc-400">{label}</p><p className="mt-1 break-all font-medium">{value}</p></article>)}
    </section>
    <p className="mt-8 text-xs text-zinc-500">La sesión web vence como máximo el {new Date(Number(session.exp)).toLocaleString('es-MX')} y nunca supera la vigencia de tu subbot.</p>
  </main>
}
