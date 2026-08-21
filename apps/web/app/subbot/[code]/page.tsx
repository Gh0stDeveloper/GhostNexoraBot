import { Bot, Clock3, Download, MessageSquare, Smartphone } from 'lucide-react'
import { openBotDb, tokenHash } from '../../../lib/runtime'

export const dynamic = 'force-dynamic'

type TokenRow = { userJid: string; subbotId: number | null; expiresAt: number }
type SubbotRow = { id: number; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function SubbotPortal({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = openBotDb()
  if (!db) return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">Panel no disponible</h1></main>
  const token = db.prepare('SELECT user_jid as userJid, subbot_id as subbotId, expires_at as expiresAt FROM portal_tokens WHERE token_hash = ? AND expires_at > ?').get(tokenHash(code), Date.now()) as TokenRow | undefined
  if (!token?.subbotId) { db.close(); return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">Enlace inválido o expirado</h1><p className="mt-3 text-zinc-400">Genera otro enlace desde WhatsApp con .subbot portal.</p></main> }
  const subbot = db.prepare('SELECT id, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots WHERE id = ? AND owner_jid = ?').get(token.subbotId, token.userJid) as SubbotRow | undefined
  db.close()
  if (!subbot) return <main className="mx-auto max-w-3xl px-5 py-24"><h1 className="text-3xl font-semibold">Instancia no encontrada</h1></main>

  const cards = [
    [Smartphone, 'Número', subbot.phone ?? 'Sin vincular'], [Bot, 'Estado', subbot.status],
    [Clock3, 'Suscripción', new Date(Number(subbot.expiresAt)).toLocaleString('es-MX')],
    [MessageSquare, 'Mensajes', Number(subbot.messagesProcessed).toLocaleString()],
    [Download, 'Descargas', `${(Number(subbot.downloadBytes) / 1024 / 1024).toFixed(1)} MB`],
  ] as const

  return <main className="mx-auto w-full max-w-5xl px-5 py-14 md:px-8">
    <p className="text-sm font-medium text-[var(--accent)]">Portal privado</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Subbot #{subbot.id}</h1>
    <p className="mt-3 max-w-2xl text-zinc-400">Este enlace está limitado exclusivamente a tu instancia. No muestra otros subbots, owners ni tokens administrativos.</p>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([Icon, label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><Icon className="size-5 text-[var(--accent)]"/><p className="mt-4 text-sm text-zinc-400">{label}</p><p className="mt-1 break-all font-medium">{value}</p></article>)}
    </section>
    <p className="mt-8 text-xs text-zinc-500">El enlace de acceso vence el {new Date(Number(token.expiresAt)).toLocaleString('es-MX')}.</p>
  </main>
}
