import { Bot, Coins, Download, LogOut, MessageSquare, Radio, RefreshCcw, Send, ShieldCheck, UserPlus } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OpsConsole } from '../../components/ops-console'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../lib/auth'
import { readOpsSnapshot } from '../../lib/ops'
import { openBotDb } from '../../lib/runtime'

export const dynamic = 'force-dynamic'
type Subbot = { id: number; ownerJid: string; phone: string | null; status: string; expiresAt: number; messagesProcessed: number; downloadBytes: number }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; instance?: string }> }) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role !== 'admin') redirect('/login?mode=admin')
  const params = await searchParams
  const db = openBotDb()
  const subbots = db ? db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as unknown as Subbot[] : []
  const users = db ? Number((db.prepare('SELECT COUNT(*) as count FROM economy_users').get() as { count: number } | undefined)?.count ?? 0) : 0
  const hasOpsGroups = db ? Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ops_groups'").get()) : false
  const registeredGroups = db ? Number(((hasOpsGroups ? db.prepare('SELECT COUNT(*) as count FROM ops_groups').get() : db.prepare('SELECT COUNT(DISTINCT group_jid) as count FROM group_members').get()) as { count?: number } | undefined)?.count ?? 0) : 0
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
  const refreshHref = `/admin?instance=${encodeURIComponent(selectedInstance)}`

  return <main className="ops-page">
    <div className="mx-auto w-full max-w-[1540px] px-4 py-7 md:px-7 lg:px-9">
      <header className="flex flex-col gap-5 border-b border-white/[.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><ShieldCheck className="size-5 text-blue-400"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">Operations Center</p><h1 className="mt-1 text-2xl font-black tracking-tight text-white">Ghost Nexora Bot · Administración</h1></div></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form method="get" className="flex gap-2"><select name="instance" defaultValue={selectedInstance} className="ops-input min-w-56"><option value="main">MainBot</option>{subbots.map((item)=><option key={item.id} value={`subbot:${item.id}`}>Subbot #{item.id} · {item.phone ?? 'sin vincular'}</option>)}</select><button className="ops-button-primary">Abrir instancia</button></form>
          <form method="post" action="/api/auth/logout"><button className="ops-button-muted h-full"><LogOut className="size-4"/>Cerrar sesión</button></form>
        </div>
      </header>

      {params.ok && <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/[.07] px-4 py-3 text-sm text-emerald-300">Operación aceptada. Las acciones sobre grupos se procesan de forma segura por la instancia correspondiente.</div>}
      {params.error && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">No se pudo aplicar: {params.error}</div>}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[[Bot,'Subbots',subbots.length],[Radio,'Subbots online',subbots.filter((s)=>s.status==='online').length],[MessageSquare,'Mensajes subbots',totalMessages],[ShieldCheck,'Usuarios economía',users],[UserPlus,'Grupos registrados',registeredGroups]].map(([Icon,label,value])=>{const I=Icon as typeof Bot;return <article key={String(label)} className="ops-stat"><I className="size-4 text-blue-500"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{String(label)}</p><p className="mt-2 text-2xl font-black text-white">{Number(value).toLocaleString('es-MX')}</p></article>})}
      </section>
      <p className="mt-3 text-xs text-zinc-600"><Download className="mr-2 inline size-3.5"/>Tráfico acumulado de subbots: {(totalBytes/1024/1024/1024).toFixed(2)} GB · Vista operativa: <span className="text-zinc-400">{instanceLabel}</span></p>

      <div className="mt-6"><OpsConsole snapshot={snapshot} refreshHref={refreshHref} instanceLabel={instanceLabel}/></div>

      <section className="mt-6 ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5"><h2 className="font-bold text-white">Administración global</h2><p className="mt-1 text-xs text-zinc-500">Economía, concesiones, sesiones y anuncios del MainBot.</p></div>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="action" value="add_nxc"/><div className="flex items-center gap-2 font-bold"><Coins className="size-4 text-blue-400"/>Añadir NXC</div><p className="mt-2 text-xs leading-5 text-zinc-500">Acredita saldo a la billetera global del usuario.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><input className="ops-input" name="amount" type="number" min="1" placeholder="5000" required/></div><button className="ops-button-primary mt-3"><Coins className="size-4"/>Acreditar</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="action" value="grant_subbot"/><div className="flex items-center gap-2 font-bold"><UserPlus className="size-4 text-blue-400"/>Regalar subbot</div><p className="mt-2 text-xs leading-5 text-zinc-500">Concede una instancia temporal o permanente.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className="ops-input" name="userJid" placeholder="521234567890" required/><select className="ops-input" name="duration"><option value="1d">1 día</option><option value="7d">7 días</option><option value="30d">30 días</option><option value="permanent">Permanente</option></select></div><button className="ops-button-primary mt-3"><Bot className="size-4"/>Conceder</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="action" value="reset_subbot"/><div className="flex items-center gap-2 font-bold"><RefreshCcw className="size-4 text-blue-400"/>Restablecer sesión</div><p className="mt-2 text-xs leading-5 text-zinc-500">Elimina credenciales de una instancia sin quitar su suscripción.</p><input className="ops-input mt-4" name="id" type="number" min="1" placeholder="ID del subbot" required/><button className="ops-button-primary mt-3"><RefreshCcw className="size-4"/>Restablecer</button></form>
          <form action="/api/control" method="post" className="ops-node"><input type="hidden" name="action" value="broadcast"/><div className="flex items-center gap-2 font-bold"><Send className="size-4 text-blue-400"/>Anuncio global</div><p className="mt-2 text-xs leading-5 text-zinc-500">Envía novedades a todos los grupos del MainBot donde pueda escribir.</p><textarea className="ops-input mt-4 min-h-24" name="message" maxLength={5000} placeholder="Nuevas funciones, correcciones..." required/><button className="ops-button-primary mt-3"><Send className="size-4"/>Enviar</button></form>
        </div>
      </section>

      <section className="mt-6 ops-panel overflow-hidden"><div className="border-b border-white/[.08] px-5 py-4 font-bold">Instancias registradas</div><div className="divide-y divide-white/[.06]">{subbots.length ? subbots.map((item)=><div key={item.id} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[70px_1fr_1.3fr_120px_180px]"><span className="font-mono text-blue-400">#{item.id}</span><span>{item.phone??'Sin vincular'}</span><span className="truncate text-zinc-500">{item.ownerJid}</span><span className={item.status==='online'?'text-emerald-400':'text-zinc-400'}>{item.status}</span><span className="text-zinc-500">{new Date(Number(item.expiresAt)).toLocaleString('es-MX')}</span></div>):<p className="px-5 py-8 text-zinc-500">No hay subbots registrados.</p>}</div></section>
    </div>
  </main>
}
