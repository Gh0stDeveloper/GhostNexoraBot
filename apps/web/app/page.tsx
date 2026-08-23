import { Activity, Bot, Coins, Download, LogIn, MessageSquareMore, Server, ShieldCheck, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'
type Health = { ok: boolean; connected: boolean; uptimeSeconds?: number; prefix?: string }

async function getHealth(): Promise<Health> {
  try {
    const response = await fetch(process.env.BOT_HEALTH_URL ?? 'http://127.0.0.1:3001/health', { cache: 'no-store', signal: AbortSignal.timeout(1500) })
    return await response.json() as Health
  } catch { return { ok: false, connected: false } }
}

const features: Array<{icon:LucideIcon;title:string;text:string}> = [
  {icon:Coins,title:'Economía global NXC',text:'Una sola billetera por usuario, banco, préstamos, minería pasiva y rankings separados por grupo.'},
  {icon:Download,title:'Descargas',text:'YouTube por API Lempi, redes sociales, archivos y proveedores 18+ con límites y limpieza temporal.'},
  {icon:WandSparkles,title:'Stickers y reacciones',text:'Stickers personales, biblioteca global del bot, reacciones contextuales y automatizaciones de moderación.'},
  {icon:ShieldCheck,title:'Administración de grupos',text:'Anti-link, anti-spam, advertencias, bienvenida, permisos y comandos por respuesta o mención.'},
  {icon:Bot,title:'Subbots',text:'Instancias temporales o permanentes con estado real, QR/código, portal privado y restablecimiento de sesión.'},
  {icon:Server,title:'Panel operativo',text:'Control autenticado para NXC, subbots, anuncios globales, métricas y administración desde la VPS.'},
]

function uptime(seconds=0){const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60);return `${h}h ${m}m`}

export default async function Home(){
  const health=await getHealth(); const online=health.connected
  return <main className="relative overflow-hidden">
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 md:px-8"><div className="flex items-center gap-3 font-semibold"><span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.05]"><Bot className="size-5 text-[var(--accent)]"/></span>Ghost Nexora Bot</div><a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"><LogIn className="size-4"/>Acceder</a></header>
    <section className="mx-auto grid min-h-[70vh] w-full max-w-7xl items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-[1.1fr_.9fr]">
      <div><div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-zinc-300"><span className={`size-2 rounded-full ${online?'bg-emerald-400':'bg-zinc-600'}`}/>{online?'WhatsApp conectado':'Bot sin conexión detectada'}</div><h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-.05em] sm:text-6xl">Un ecosistema completo para <span className="text-[var(--accent)]">WhatsApp.</span></h1><p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">Ghost Nexora Bot reúne economía NXC, minijuegos, IA, descargas, colecciones, reacciones, moderación, subbots y administración web en una experiencia enfocada en comunidades.</p><div className="mt-8 flex flex-wrap gap-3"><a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black"><LogIn className="size-4"/>Abrir panel</a><a href="#features" className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-semibold">Explorar funciones</a></div></div>
      <div className="rounded-3xl border border-white/10 bg-[#080c10]/90 p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="flex items-center gap-2 text-sm"><Activity className="size-4 text-[var(--accent)]"/>Estado del servicio</span><span className="text-xs text-zinc-500">V2</span></div><div className="mt-5 grid gap-3 text-sm">{[['WhatsApp',online?'Connected':'Offline'],['Prefix',health.prefix??'.'],['Uptime',online?uptime(health.uptimeSeconds):'—'],['Economy','Global wallet + group rankings'],['Web','Authenticated control panel']].map(([a,b])=><div key={a} className="flex justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-zinc-500">{a}</span><span>{b}</span></div>)}</div></div>
    </section>
    <section id="features" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Ghost Nexora V2</p><h2 className="mt-3 text-4xl font-semibold">Más funciones, mejor separadas.</h2><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(({icon:Icon,title,text})=><article key={title} className="rounded-2xl border border-white/[.08] bg-white/[.025] p-6"><span className="grid size-10 place-items-center rounded-xl bg-emerald-400/[.08]"><Icon className="size-5 text-[var(--accent)]"/></span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p></article>)}</div></section>
    <section className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8"><div className="rounded-3xl border border-white/[.08] bg-[#090d12]/80 p-7 md:p-9"><div className="flex items-center gap-2"><MessageSquareMore className="size-5 text-[var(--accent)]"/><h2 className="text-2xl font-semibold">Menú dividido dentro de WhatsApp</h2></div><p className="mt-3 max-w-3xl text-zinc-400">Usa <strong>.menu</strong> para la vista principal y abre categorías como <strong>.menu downloads</strong>, <strong>.menu economy</strong>, <strong>.menu social</strong>, <strong>.menu adult</strong> o <strong>.menu admin</strong>. Cada comando incluye una descripción breve para reducir ruido.</p><div className="mt-6 grid gap-3 md:grid-cols-3">{[['YouTube','.yts · .ytmp3 · .ytmp4'],['Economía','.balance · .work · .loan · .miner'],['Administración','.menu admin · .broadcast · .subbotgrant']].map(([a,b])=><div key={a} className="rounded-xl border border-white/[.07] bg-white/[.02] p-4"><p className="font-semibold">{a}</p><p className="mt-2 font-mono text-xs text-zinc-400">{b}</p></div>)}</div></div></section>
    <section className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8"><div className="rounded-3xl border border-emerald-300/10 bg-emerald-400/[.04] p-8"><Sparkles className="size-6 text-[var(--accent)]"/><h2 className="mt-4 text-3xl font-semibold">Despliegue administrado</h2><p className="mt-3 max-w-2xl leading-7 text-zinc-400">La instalación y actualización del servidor se gestionan desde el entorno administrativo. El sitio público no expone repositorios, código fuente ni rutas internas de despliegue.</p></div></section>
    <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-white/[.07] px-5 py-8 text-sm text-zinc-500 md:flex-row md:items-center md:justify-between md:px-8"><p>Ghost Developer / Nexora · Ghost Nexora Bot</p><a href="/login" className="inline-flex items-center gap-2 text-zinc-300"><LogIn className="size-4"/>Acceso privado</a></footer>
  </main>
}
