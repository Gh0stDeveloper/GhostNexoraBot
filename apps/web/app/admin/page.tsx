import { Bot, Database, HardDrive, LogOut, MessageSquare, ShieldCheck } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { openBotDb } from '../../lib/runtime'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../lib/auth'

export const dynamic = 'force-dynamic'

type Subbot = { id: number; ownerJid: string; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function AdminPage() {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'admin') redirect('/login?mode=admin')

  const db = openBotDb()
  const subbots = db ? db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as unknown as Subbot[] : []
  const users = db ? Number((db.prepare('SELECT COUNT(*) as count FROM economy_users').get() as { count: number }).count) : 0
  const totalMessages = subbots.reduce((sum, item) => sum + Number(item.messagesProcessed), 0)
  const totalBytes = subbots.reduce((sum, item) => sum + Number(item.downloadBytes), 0)
  db?.close()

  return <main className="mx-auto w-full max-w-7xl px-5 py-12 md:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-[var(--accent)]"/><div><p className="text-sm text-zinc-400">Owner control center</p><h1 className="text-3xl font-semibold">Ghost Nexora Bot</h1></div></div>
      <form method="post" action="/api/auth/logout"><button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[.08] hover:text-white"><LogOut className="size-4"/>Cerrar sesión</button></form>
    </div>
    <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-400/[.04] px-5 py-4 text-sm text-zinc-400">Sesión administrativa firmada activa. El token ya no forma parte de la URL ni del historial del navegador.</div>
    <section className="mt-8 grid gap-4 md:grid-cols-4">
      {[
        [Bot, 'Subbots', subbots.length.toString()], [ShieldCheck, 'Online', subbots.filter((s) => s.status === 'online').length.toString()],
        [MessageSquare, 'Mensajes', totalMessages.toLocaleString()], [Database, 'Usuarios economy', users.toLocaleString()],
      ].map(([Icon, label, value]) => { const I = Icon as typeof Bot; return <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><I className="size-5 text-[var(--accent)]"/><p className="mt-4 text-sm text-zinc-400">{String(label)}</p><p className="mt-1 text-2xl font-semibold">{String(value)}</p></article> })}
    </section>
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center gap-2 text-sm text-zinc-400"><HardDrive className="size-4"/>Tráfico acumulado de descargas: {(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB</div></div>
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/10">
      <div className="border-b border-white/10 bg-white/[.04] px-5 py-4 font-semibold">Instancias</div>
      <div className="divide-y divide-white/10">
        {subbots.length ? subbots.map((item) => <div key={item.id} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[80px_1fr_1fr_120px_160px]">
          <span>#{item.id}</span><span className="text-zinc-300">{item.phone ?? 'Sin vincular'}</span><span className="text-zinc-400">{item.ownerJid}</span><span>{item.status}</span><span className="text-zinc-400">{new Date(Number(item.expiresAt)).toLocaleString('es-MX')}</span>
        </div>) : <p className="px-5 py-8 text-zinc-400">Todavía no hay subbots registrados.</p>}
      </div>
    </section>
  </main>
}
