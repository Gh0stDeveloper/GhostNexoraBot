import { Bot, Coins, Download, LogOut, MessageSquare, Radio, RefreshCcw, Send, ShieldCheck, UserPlus } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { openBotDb } from '../../lib/runtime'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../lib/auth'

export const dynamic = 'force-dynamic'
type Subbot = { id: number; ownerJid: string; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const cookieStore = await cookies(); const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'admin') redirect('/login?mode=admin')
  const params = await searchParams
  const db = openBotDb()
  const subbots = db ? db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as unknown as Subbot[] : []
  const users = db ? Number((db.prepare('SELECT COUNT(*) as count FROM economy_users').get() as { count: number }).count) : 0
  const groups = db ? Number((db.prepare("SELECT COUNT(DISTINCT group_jid) as count FROM group_members").get() as { count: number } | undefined)?.count ?? 0) : 0
  const totalMessages = subbots.reduce((sum, item) => sum + Number(item.messagesProcessed), 0); const totalBytes = subbots.reduce((sum, item) => sum + Number(item.downloadBytes), 0); db?.close()
  const input = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400/40'
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-strong)]'

  return <main className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3"><ShieldCheck className="size-7 text-[var(--accent)]"/><div><p className="text-sm text-zinc-400">Centro de control</p><h1 className="text-3xl font-semibold">Ghost Nexora Bot</h1></div></div>
      <form method="post" action="/api/auth/logout"><button className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm"><LogOut className="mr-2 inline size-4"/>Cerrar sesión</button></form>
    </header>
    {params.ok && <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm">Acción aplicada correctamente.</div>}
    {params.error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm">No se pudo aplicar: {params.error}</div>}

    <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {[[Bot,'Subbots',subbots.length],[Radio,'Online',subbots.filter((s)=>s.status==='online').length],[MessageSquare,'Mensajes',totalMessages],[ShieldCheck,'Usuarios',users],[UserPlus,'Grupos registrados',groups]].map(([Icon,label,value])=>{const I=Icon as typeof Bot;return <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><I className="size-5 text-[var(--accent)]"/><p className="mt-3 text-sm text-zinc-400">{String(label)}</p><p className="mt-1 text-2xl font-semibold">{Number(value).toLocaleString()}</p></article>})}
    </section>
    <p className="mt-4 text-sm text-zinc-500"><Download className="mr-2 inline size-4"/>Tráfico subbots: {(totalBytes/1024/1024/1024).toFixed(2)} GB</p>

    <section className="mt-8 grid gap-5 lg:grid-cols-2">
      <form action="/api/control" method="post" className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <input type="hidden" name="action" value="add_nxc"/><div className="flex items-center gap-2 font-semibold"><Coins className="size-5 text-[var(--accent)]"/>Añadir NXC</div>
        <p className="mt-2 text-sm text-zinc-400">Acredita saldo en la billetera global del usuario.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={input} name="userJid" placeholder="521234567890" required/><input className={input} name="amount" type="number" min="1" placeholder="5000" required/></div><button className={`${button} mt-4`}><Coins className="size-4"/>Acreditar</button>
      </form>
      <form action="/api/control" method="post" className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <input type="hidden" name="action" value="grant_subbot"/><div className="flex items-center gap-2 font-semibold"><UserPlus className="size-5 text-[var(--accent)]"/>Regalar subbot</div>
        <p className="mt-2 text-sm text-zinc-400">Concede una instancia temporal o permanente.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={input} name="userJid" placeholder="521234567890" required/><select className={input} name="duration"><option value="1d">1 día</option><option value="7d">7 días</option><option value="30d">30 días</option><option value="permanent">Permanente</option></select></div><button className={`${button} mt-4`}><Bot className="size-4"/>Conceder</button>
      </form>
      <form action="/api/control" method="post" className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <input type="hidden" name="action" value="reset_subbot"/><div className="flex items-center gap-2 font-semibold"><RefreshCcw className="size-5 text-[var(--accent)]"/>Restablecer sesión</div>
        <p className="mt-2 text-sm text-zinc-400">Borra credenciales de una instancia sin eliminar su suscripción.</p><input className={`${input} mt-4`} name="id" type="number" min="1" placeholder="ID del subbot" required/><button className={`${button} mt-4`}><RefreshCcw className="size-4"/>Restablecer</button>
      </form>
      <form action="/api/control" method="post" className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <input type="hidden" name="action" value="broadcast"/><div className="flex items-center gap-2 font-semibold"><Send className="size-5 text-[var(--accent)]"/>Anuncio global</div>
        <p className="mt-2 text-sm text-zinc-400">Envía novedades a todos los grupos donde el MainBot pueda escribir.</p><textarea className={`${input} mt-4 min-h-28`} name="message" maxLength={5000} placeholder="Nuevas funciones, correcciones..." required/><button className={`${button} mt-4`}><Send className="size-4"/>Enviar a grupos</button>
      </form>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-white/10"><div className="border-b border-white/10 bg-white/[.04] px-5 py-4 font-semibold">Instancias</div><div className="divide-y divide-white/10">
      {subbots.length ? subbots.map((item)=><div key={item.id} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[70px_1fr_1fr_120px_170px]"><span>#{item.id}</span><span>{item.phone??'Sin vincular'}</span><span className="text-zinc-400">{item.ownerJid}</span><span className={item.status==='online'?'text-emerald-400':'text-zinc-300'}>{item.status}</span><span className="text-zinc-400">{new Date(Number(item.expiresAt)).toLocaleString('es-MX')}</span></div>):<p className="px-5 py-8 text-zinc-400">No hay subbots registrados.</p>}
    </div></section>
  </main>
}
