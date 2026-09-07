import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Coins,
  Download,
  Gamepad2,
  Globe2,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  MessageSquareMore,
  MonitorSmartphone,
  Server,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

type Health = {
  ok: boolean
  connected: boolean
  uptimeSeconds?: number
  prefix?: string
}

async function getHealth(): Promise<Health> {
  try {
    const response = await fetch(process.env.BOT_HEALTH_URL ?? 'http://127.0.0.1:3001/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    })
    return await response.json() as Health
  } catch {
    return { ok: false, connected: false }
  }
}

type Feature = {
  icon: LucideIcon
  title: string
  text: string
  highlights: string[]
}

const features: Feature[] = [
  {
    icon: BrainCircuit,
    title: 'Asistente e inteligencia artificial',
    text: 'Conversación, consultas, investigación asistida y herramientas de conocimiento integradas directamente en WhatsApp.',
    highlights: ['Conversación contextual', 'Investigación y búsqueda', 'Respuestas extensas y código'],
  },
  {
    icon: Download,
    title: 'Descargas y contenido multimedia',
    text: 'Flujos guiados para encontrar, seleccionar y recibir contenido desde distintas plataformas sin salir del chat.',
    highlights: ['Video y audio', 'Redes sociales', 'Aplicaciones y archivos'],
  },
  {
    icon: Coins,
    title: 'Economía Nexora',
    text: 'Una economía persistente para comunidades con saldo, banco, profesiones, recompensas, préstamos, comercio y progresión.',
    highlights: ['Nexora Coins', 'Banco y finanzas', 'Rankings y progresión'],
  },
  {
    icon: Gamepad2,
    title: 'Juegos y entretenimiento',
    text: 'Minijuegos, apuestas con moneda virtual, experiencias HTML interactivas, PvP, colección de waifus y sistemas RPG.',
    highlights: ['Minijuegos', 'PvP y RPG', 'Gacha y colección'],
  },
  {
    icon: ShieldCheck,
    title: 'Comunidades y moderación',
    text: 'Herramientas para administrar grupos, automatizar tareas repetitivas y mantener conversaciones más ordenadas.',
    highlights: ['Anti-link y anti-spam', 'Bienvenida y despedida', 'Permisos y controles'],
  },
  {
    icon: WandSparkles,
    title: 'Personalización',
    text: 'El bot puede adaptar su identidad visual, banners, stickers, estilos de waifu y presentación a cada instancia.',
    highlights: ['Estilos visuales', 'Stickers', 'Identidad por subbot'],
  },
]

const environments: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MessageSquareMore,
    title: 'WhatsApp Multi-Device',
    text: 'Experiencia principal para chats privados, grupos, administradores y comunidades.',
  },
  {
    icon: Server,
    title: 'VPS / Linux',
    text: 'Entorno recomendado para una instancia permanente, estable y disponible de forma continua.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Android · Termux Lite',
    text: 'Perfil ligero para ejecutar las funciones esenciales desde Android cuando no se necesita toda la infraestructura web.',
  },
  {
    icon: LayoutDashboard,
    title: 'Panel web privado',
    text: 'Administración visual para el propietario y personal autorizado, separada del sitio público.',
  },
]

const experience = [
  ['Español e inglés', 'El idioma puede definirse globalmente y cada grupo puede utilizar su propio idioma.'],
  ['MainBot y subbots', 'Las instancias secundarias mantienen su propia sesión y configuración sin mezclar su operación cotidiana.'],
  ['Grupos y privado', 'Funciones diseñadas tanto para comunidades como para conversaciones directas autorizadas.'],
  ['Interacción visual', 'Carruseles, botones, listas, tarjetas, imágenes y experiencias compatibles con WhatsApp.'],
]

function uptime(seconds = 0) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

export default async function Home() {
  const health = await getHealth()
  const online = health.connected

  return (
    <main className="relative overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-white/[.06] bg-[#05070a]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <a href="#inicio" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.05]">
              <Bot className="size-5 text-[var(--accent)]" />
            </span>
            <span>Ghost Nexora Bot</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a className="transition hover:text-white" href="#funciones">Funciones</a>
            <a className="transition hover:text-white" href="#experiencia">Experiencia</a>
            <a className="transition hover:text-white" href="#plataformas">Plataformas</a>
            <a className="transition hover:text-white" href="#seguridad">Seguridad</a>
          </nav>
          <a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
            <LogIn className="size-4" />
            Acceder
          </a>
        </div>
      </header>

      <section id="inicio" className="mx-auto grid min-h-[76vh] w-full max-w-7xl items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-zinc-300">
            <span className={`size-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {online ? 'Servicio de WhatsApp conectado' : 'Servicio de WhatsApp sin conexión detectada'}
          </div>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.01] tracking-[-.055em] sm:text-6xl lg:text-7xl">
            Mucho más que un bot de <span className="text-[var(--accent)]">WhatsApp.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
            Ghost Nexora Bot es un ecosistema para comunidades: combina inteligencia artificial, descargas, economía, juegos, perfiles, colecciones, stickers, moderación, personalización y subbots en una sola experiencia.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#funciones" className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110">Conocer el bot</a>
            <a href="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-semibold transition hover:bg-white/[.07]">
              <LockKeyhole className="size-4" />
              Panel privado
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--accent)]" />Español / English</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--accent)]" />Grupos y privado</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--accent)]" />MainBot + subbots</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-emerald-400/[.06] blur-3xl" />
          <div className="rounded-3xl border border-white/10 bg-[#080c10]/90 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="flex items-center gap-2 text-sm"><Activity className="size-4 text-[var(--accent)]" />Estado de Ghost Nexora</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${online ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-zinc-500'}`}>{online ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-zinc-500">WhatsApp</span><span>{online ? 'Conectado' : 'Sin conexión'}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-zinc-500">Idiomas</span><span>Español · English</span></div>
              <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-zinc-500">Experiencia</span><span>Grupos · Privado · Subbots</span></div>
              <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-zinc-500">Disponibilidad</span><span>{online ? uptime(health.uptimeSeconds) : '—'}</span></div>
            </div>
            <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-400/[.04] p-4">
              <p className="text-sm font-semibold">Diseñado para crecer con la comunidad</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Cada módulo se integra dentro del mismo bot para evitar saltar entre múltiples servicios o interfaces.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="funciones" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Funciones</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.035em] md:text-5xl">Una sola experiencia, muchas herramientas.</h2>
          <p className="mt-4 text-base leading-7 text-zinc-400">Las funciones están organizadas por categorías para que cada usuario encuentre rápidamente lo que necesita desde WhatsApp.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text, highlights }) => (
            <article key={title} className="rounded-2xl border border-white/[.08] bg-white/[.025] p-6 transition hover:-translate-y-0.5 hover:border-white/[.14] hover:bg-white/[.035]">
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-400/[.08]"><Icon className="size-5 text-[var(--accent)]" /></span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
              <ul className="mt-5 space-y-2 border-t border-white/[.07] pt-4 text-sm text-zinc-500">
                {highlights.map((item) => <li key={item} className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-400/80" />{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="experiencia" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="grid gap-8 rounded-3xl border border-white/[.08] bg-[#090d12]/80 p-7 md:p-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <Languages className="size-7 text-[var(--accent)]" />
            <h2 className="mt-5 text-3xl font-semibold tracking-[-.03em]">Se adapta a cada comunidad.</h2>
            <p className="mt-4 leading-7 text-zinc-400">Una misma instalación puede comportarse de forma distinta según el chat, el grupo, la instancia y el idioma configurado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {experience.map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
                <p className="font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plataformas" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="flex max-w-3xl items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-400/[.08]"><Globe2 className="size-5 text-blue-300" /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-300">Plataformas y entornos</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-[-.035em]">Pensado para diferentes formas de uso.</h2>
          </div>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {environments.map(({ icon: Icon, title, text }) => (
            <article key={title} className="flex gap-4 rounded-2xl border border-white/[.08] bg-white/[.02] p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.03]"><Icon className="size-5 text-zinc-300" /></span>
              <div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6"><UsersRound className="size-5 text-[var(--accent)]" /><h3 className="mt-4 font-semibold">Para comunidades</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Perfiles, economía, juegos, rankings, automatización y herramientas sociales ayudan a mantener una comunidad activa.</p></article>
          <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6"><Bot className="size-5 text-[var(--accent)]" /><h3 className="mt-4 font-semibold">Subbots independientes</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Una comunidad puede disponer de su propia instancia vinculada con identidad y sesión separadas.</p></article>
          <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6"><Sparkles className="size-5 text-[var(--accent)]" /><h3 className="mt-4 font-semibold">Evolución continua</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Ghost Nexora Bot está diseñado como una plataforma modular para incorporar nuevas experiencias sin reemplazar el núcleo del bot.</p></article>
        </div>
      </section>

      <section id="seguridad" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="rounded-3xl border border-emerald-300/10 bg-emerald-400/[.04] p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div>
              <ShieldCheck className="size-7 text-[var(--accent)]" />
              <h2 className="mt-4 text-3xl font-semibold tracking-[-.03em]">Administración privada y separación de acceso.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-zinc-400">La información administrativa permanece detrás del acceso privado. El sitio público explica el producto y sus capacidades sin publicar código fuente, credenciales, rutas internas ni información sensible de operación.</p>
            </div>
            <div className="space-y-3 text-sm">
              {['Panel administrativo con acceso restringido', 'Permisos diferenciados para owner, staff y administradores', 'Configuración independiente por grupo e instancia', 'Herramientas de moderación y control de comunidad'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-black/10 px-4 py-3"><CheckCircle2 className="size-4 text-[var(--accent)]" /><span className="text-zinc-300">{item}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-24 pt-10 md:px-8">
        <div className="rounded-3xl border border-white/[.08] bg-[#090d12] p-8 text-center md:p-12">
          <Bot className="mx-auto size-8 text-[var(--accent)]" />
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-[-.03em]">Ghost Nexora Bot concentra una comunidad completa dentro de WhatsApp.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-zinc-400">El sitio público está dedicado a presentar el bot. Las herramientas de operación y administración continúan disponibles únicamente para usuarios autorizados.</p>
          <a href="/login" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"><LogIn className="size-4" />Acceso administrativo</a>
        </div>
      </section>

      <footer className="border-t border-white/[.07]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-zinc-500 md:flex-row md:items-center md:justify-between md:px-8">
          <div><p className="font-medium text-zinc-300">Ghost Nexora Bot</p><p className="mt-1">Ghost Developer / Nexora</p></div>
          <div className="flex flex-wrap items-center gap-5"><a href="#funciones" className="hover:text-zinc-300">Funciones</a><a href="#plataformas" className="hover:text-zinc-300">Plataformas</a><a href="/login" className="inline-flex items-center gap-2 text-zinc-300"><LogIn className="size-4" />Acceso privado</a></div>
        </div>
      </footer>
    </main>
  )
}
