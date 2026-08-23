import { Bot, Clock3, Download, LogOut, MessageSquare, RefreshCcw, Smartphone } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { openBotDb } from '../../lib/runtime'
import { SUBBOT_SESSION_COOKIE, verifySession } from '../../lib/auth'

export const dynamic = 'force-dynamic'
type SubbotRow = { id: number; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function SubbotPortal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const cookieStore = await cookies(); const session = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'subbot') redirect('/login?mode=subbot')
  const params = await searchParams
  const db = openBotDb(); if (!db) return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">Panel no disponible</h1><p className="mt-3 text-zinc-400">La base de datos todavía no está disponible.</p></main>
  const subbot = db.prepare(`SELECT id, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots WHERE id = ? AND owner_jid = ? AND expires_at > ?`).get(session.subbotId, session.userJid, Date.now()) as SubbotRow | undefined
  db.close(); if (!subbot) redirect('/login?mode=subbot&error=invalid')
  const labels: Record<string,string> = { pending:'Sin vincular', pairing:'Esperando vinculación', online:'Online', offline:'Vinculado · offline', logged_out:'Sesión cerrada', revoked:'Revocado' }
  const cards = [[Smartphone,'Número',subbot.phone??'Sin vincular'],[Bot,'Estado',labels[subbot.status]??subbot.status],[Clock3,'Suscripción',new Date(Number(subbot.expiresAt)).toLocaleString('es-MX')],[MessageSquare,'Mensajes',Number(subbot.messagesProcessed).toLocaleString()],[Download,'Descargas',`${(Number(subbot.downloadBytes)/1024/1024).toFixed(1)} MB`]] as const
  return <main className="mx-auto w-full max-w-5xl px-5 py-14 md:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-medium text-[var(--accent)]">Portal privado</p><h1 className="mt-2 text-4xl font-semibold">Subbot #{subbot.id}</h1><p className="mt-3 max-w-2xl text-zinc-400">Consulta el estado real y restablece una vinculación fallida sin perder el tiempo pagado.</p></div><form method="post" action="/api/auth/logout"><button className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm"><LogOut className="mr-2 inline size-4"/>Cerrar sesión</button></form></div>
    {params.ok && <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm">La sesión fue restablecida. Puedes volver a vincular desde WhatsApp.</div>}
    {params.error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm">No se pudo completar: {params.error}</div>}
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([Icon,label,value])=><article key={label} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><Icon className="size-5 text-[var(--accent)]"/><p className="mt-4 text-sm text-zinc-400">{label}</p><p className="mt-1 break-all font-medium">{value}</p></article>)}</section>
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center gap-2 font-semibold"><RefreshCcw className="size-5 text-[var(--accent)]"/>¿La vinculación quedó dañada?</div><p className="mt-2 text-sm leading-6 text-zinc-400">Restablecer elimina las credenciales actuales, el QR/código anterior y los tokens de portal. La suscripción y su fecha de vencimiento no se eliminan.</p><form action="/api/control" method="post" className="mt-4"><input type="hidden" name="action" value="reset_own_subbot"/><button className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black"><RefreshCcw className="size-4"/>Borrar sesión y volver a vincular</button></form></section>
    <p className="mt-8 text-xs text-zinc-500">La sesión web vence como máximo el {new Date(Number(session.exp)).toLocaleString('es-MX')}.</p>
  </main>
}
