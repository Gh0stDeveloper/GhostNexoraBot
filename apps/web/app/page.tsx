import {
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
  ShieldCheck,
  Sparkles,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'

type Feature = {
  icon: LucideIcon
  title: string
  text: string
  highlights: string[]
  tone: 'cyan' | 'violet' | 'green'
}

const features: Feature[] = [
  {
    icon: BrainCircuit,
    title: 'Asistente e inteligencia artificial',
    text: 'Conversación, consultas, investigación asistida y herramientas inteligentes integradas directamente en WhatsApp.',
    highlights: ['Conversación contextual', 'Búsqueda e investigación', 'Respuestas extensas y código'],
    tone: 'cyan',
  },
  {
    icon: Download,
    title: 'Descargas y multimedia',
    text: 'Flujos guiados para encontrar, seleccionar y recibir contenido desde diferentes plataformas sin abandonar el chat.',
    highlights: ['Video y audio', 'Redes sociales', 'Aplicaciones y archivos'],
    tone: 'violet',
  },
  {
    icon: Coins,
    title: 'Economía Nexora',
    text: 'Una economía persistente para comunidades con cartera, banco, profesiones, comercio, recompensas y progresión.',
    highlights: ['Nexora Coins', 'Banco y finanzas', 'Rankings y progreso'],
    tone: 'green',
  },
  {
    icon: Gamepad2,
    title: 'Arcade y entretenimiento',
    text: 'Juegos clásicos, experiencias HTML interactivas, PvP, sistemas RPG, casino virtual y colecciones para jugar dentro de WhatsApp.',
    highlights: ['Mario, Dino y Ninja', 'Pac-Man, Buscaminas y Piano Tiles', 'PvP, RPG y colección'],
    tone: 'violet',
  },
  {
    icon: ShieldCheck,
    title: 'Comunidades y moderación',
    text: 'Herramientas para administrar grupos, automatizar tareas repetitivas y mantener una comunidad más organizada.',
    highlights: ['Anti-link y anti-spam', 'Bienvenida y despedida', 'Permisos y controles'],
    tone: 'cyan',
  },
  {
    icon: WandSparkles,
    title: 'Personalización',
    text: 'Cada comunidad puede adaptar la presentación del bot con estilos visuales, banners, stickers, waifus y configuraciones propias.',
    highlights: ['Estilos visuales', 'Stickers y perfiles', 'Identidad por instancia'],
    tone: 'green',
  },
]

const experience = [
  ['Español e inglés', 'El idioma puede definirse de forma general y cada grupo puede mantener su propia preferencia.'],
  ['MainBot y subbots', 'Una misma plataforma puede ofrecer experiencias independientes para diferentes comunidades.'],
  ['Grupos y privado', 'Comandos y experiencias diseñados tanto para conversaciones directas como para grupos.'],
  ['Interfaz enriquecida', 'Carruseles, botones, listas, tarjetas, imágenes y juegos interactivos dentro de WhatsApp.'],
]

const platforms: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MessageSquareMore,
    title: 'WhatsApp Multi-Device',
    text: 'La experiencia principal del bot: comandos, respuestas, multimedia, juegos y herramientas sociales dentro del chat.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Móvil y escritorio',
    text: 'Pensado para utilizarse desde los clientes modernos de WhatsApp en teléfono y equipos vinculados, según las capacidades disponibles en cada versión.',
  },
  {
    icon: UsersRound,
    title: 'Grupos y comunidades',
    text: 'Moderación, economía, perfiles, entretenimiento y configuraciones adaptables para espacios con muchos participantes.',
  },
  {
    icon: LayoutDashboard,
    title: 'Experiencia web complementaria',
    text: 'El sitio público presenta el proyecto y el acceso administrativo permanece separado para usuarios autorizados.',
  },
]

const arcade = [
  'Mario',
  'Dino Runner',
  'Ninja',
  'Snake',
  'Doom',
  'Space Dodge',
  'Pac-Man',
  'Buscaminas',
  'Piano Tiles',
  'Bounce',
  'Halo Arena',
]

const toneClass: Record<Feature['tone'], string> = {
  cyan: 'border-cyan-300/15 bg-cyan-300/[.055] text-cyan-200',
  violet: 'border-violet-300/15 bg-violet-300/[.055] text-violet-200',
  green: 'border-emerald-300/15 bg-emerald-300/[.055] text-emerald-200',
}

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 cyber-grid opacity-70" />
      <div className="pointer-events-none fixed left-[-12rem] top-24 -z-10 size-[30rem] rounded-full bg-cyan-400/[.10] blur-[110px]" />
      <div className="pointer-events-none fixed right-[-10rem] top-[32rem] -z-10 size-[32rem] rounded-full bg-violet-500/[.12] blur-[120px]" />

      <header className="sticky top-0 z-30 border-b border-cyan-200/[.08] bg-[#030610]/80 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <a href="#inicio" className="group flex items-center gap-3">
            <span className="relative grid size-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] shadow-[0_0_24px_rgba(34,211,238,.12)]">
              <Bot className="size-5 text-cyan-200" />
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full border border-[#030610] bg-violet-400" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[.08em] text-white">GHOST NEXORA</span>
              <span className="block text-[10px] uppercase tracking-[.22em] text-cyan-200/60">WhatsApp Bot</span>
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-slate-400 lg:flex">
            <a className="transition hover:text-cyan-200" href="#perfil">Perfil</a>
            <a className="transition hover:text-cyan-200" href="#funciones">Funciones</a>
            <a className="transition hover:text-cyan-200" href="#arcade">Juegos</a>
            <a className="transition hover:text-cyan-200" href="#experiencia">Experiencia</a>
            <a className="transition hover:text-cyan-200" href="#plataformas">Plataformas</a>
          </nav>

          <a href="/login" className="cyber-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-[#021014]">
            <LogIn className="size-4" />
            Acceder
          </a>
        </div>
      </header>

      <section id="inicio" className="mx-auto grid min-h-[82vh] w-full max-w-7xl items-center gap-14 px-5 py-16 md:px-8 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/[.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.18em] text-violet-200">
            <Sparkles className="size-3.5" />
            Comunidad · IA · Multimedia · Arcade
          </div>

          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[.98] tracking-[-.055em] text-white sm:text-6xl lg:text-7xl">
            Tu comunidad de WhatsApp, llevada a otro <span className="cyber-text">nivel.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300/80">
            Ghost Nexora Bot reúne inteligencia artificial, descargas, economía, juegos, perfiles, colecciones, moderación, personalización y subbots en una experiencia diseñada para hacer que un chat sea mucho más que mensajes.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#funciones" className="cyber-button rounded-xl px-5 py-3 text-sm font-bold text-[#021014]">Explorar funciones</a>
            <a href="#perfil" className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[.06] px-5 py-3 text-sm font-semibold text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-300/[.10]">
              <Bot className="size-4" />
              Ver perfil
            </a>
          </div>

          <div className="mt-11 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-400">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-cyan-300" />Español / English</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-violet-300" />Grupos y privado</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-300" />MainBot + subbots</span>
          </div>
        </div>

        <div id="perfil" className="relative scroll-mt-28">
          <div className="absolute inset-8 -z-10 rounded-full bg-cyan-300/[.12] blur-[80px]" />
          <div className="cyber-card relative overflow-hidden rounded-[2rem] p-1">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-[#070b17]/95 p-6 sm:p-7">
              <div className="absolute right-0 top-0 h-32 w-32 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,.25),transparent_68%)]" />
              <div className="absolute bottom-0 left-0 h-32 w-32 bg-[radial-gradient(circle_at_bottom_left,rgba(34,211,238,.18),transparent_68%)]" />

              <div className="relative flex items-start gap-5">
                <div className="profile-core grid size-24 shrink-0 place-items-center rounded-[1.6rem] sm:size-28">
                  <Bot className="size-12 text-white sm:size-14" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.25em] text-cyan-300/70">Perfil oficial</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-.035em] text-white sm:text-3xl">Ghost Nexora Bot</h2>
                  <p className="mt-1 text-sm text-violet-200/75">by Ghost Developer / Nexora</p>
                </div>
              </div>

              <p className="relative mt-6 text-sm leading-6 text-slate-300/80">
                Un bot multipropósito pensado para convertir WhatsApp en un espacio más útil, interactivo y entretenido para usuarios, grupos y comunidades.
              </p>

              <div className="relative mt-6 grid grid-cols-2 gap-3">
                {[
                  ['Identidad', 'Personalizable'],
                  ['Idiomas', 'ES · EN'],
                  ['Experiencia', 'Social + Arcade'],
                  ['Formato', 'Interactivo'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[.08] bg-white/[.035] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[.16em] text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
                  </div>
                ))}
              </div>

              <div className="relative mt-5 flex flex-wrap gap-2">
                {['IA', 'Economía', 'Juegos', 'Descargas', 'Moderación', 'Waifus', 'Subbots'].map((tag, index) => (
                  <span key={tag} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${index % 3 === 0 ? 'border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200' : index % 3 === 1 ? 'border-violet-300/15 bg-violet-300/[.06] text-violet-200' : 'border-emerald-300/15 bg-emerald-300/[.06] text-emerald-200'}`}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funciones" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-20 md:px-8">
        <div className="max-w-3xl">
          <p className="section-kicker">Núcleo de funciones</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-.04em] text-white md:text-5xl">Todo vive dentro de una misma experiencia.</h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">Cada módulo está pensado para sentirse como parte del mismo bot, no como una colección de herramientas desconectadas.</p>
        </div>

        <div className="mt-11 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text, highlights, tone }) => (
            <article key={title} className="group cyber-panel rounded-2xl p-6 transition duration-300 hover:-translate-y-1">
              <span className={`grid size-11 place-items-center rounded-xl border ${toneClass[tone]}`}><Icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              <ul className="mt-5 space-y-2 border-t border-white/[.07] pt-4 text-sm text-slate-400">
                {highlights.map((item) => <li key={item} className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-cyan-300" />{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="arcade" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-20 md:px-8">
        <div className="cyber-card overflow-hidden rounded-3xl p-[1px]">
          <div className="grid gap-9 rounded-[calc(1.5rem-1px)] bg-[#070b16]/95 p-7 md:p-10 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
            <div>
              <span className="grid size-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/[.08]"><Gamepad2 className="size-6 text-violet-200" /></span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-violet-300">Ghost Nexora Arcade</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-.035em] text-white md:text-4xl">Juegos que se sienten dentro del chat.</h2>
              <p className="mt-4 leading-7 text-slate-400">Desde clásicos rápidos hasta experiencias HTML interactivas con controles táctiles, puntuación y progresión.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {arcade.map((game, index) => (
                <div key={game} className="rounded-xl border border-white/[.08] bg-white/[.035] px-4 py-4 transition hover:border-violet-300/25 hover:bg-violet-300/[.06]">
                  <span className="text-[10px] font-bold text-violet-300/60">{String(index + 1).padStart(2, '0')}</span>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{game}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="experiencia" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-20 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <Languages className="size-8 text-cyan-300" />
            <p className="mt-5 section-kicker">Experiencia adaptable</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.035em] text-white md:text-4xl">Una personalidad para cada comunidad.</h2>
            <p className="mt-4 leading-7 text-slate-400">El bot puede cambiar su forma de presentarse según el idioma, el grupo, el estilo visual y la instancia que lo utiliza.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {experience.map(([title, text], index) => (
              <article key={title} className="cyber-panel rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <span className={`h-px w-12 ${index % 2 ? 'bg-violet-300' : 'bg-cyan-300'}`} />
                  <span className="text-[10px] font-bold tracking-[.2em] text-slate-600">0{index + 1}</span>
                </div>
                <p className="mt-5 font-bold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="plataformas" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-20 md:px-8">
        <div className="flex max-w-3xl items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.07]"><Globe2 className="size-5 text-cyan-200" /></span>
          <div>
            <p className="section-kicker">Dónde vive Nexora</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-.04em] text-white">Pensado alrededor de WhatsApp.</h2>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {platforms.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="cyber-panel flex gap-4 rounded-2xl p-6">
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl border ${index % 2 ? 'border-violet-300/15 bg-violet-300/[.06] text-violet-200' : 'border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200'}`}><Icon className="size-5" /></span>
              <div><h3 className="font-bold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <article className="cyber-panel rounded-2xl p-6">
            <UsersRound className="size-6 text-cyan-300" />
            <h3 className="mt-5 text-lg font-bold text-white">Hecho para comunidades</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Perfiles, economía, juegos, rankings, moderación y herramientas sociales ayudan a mantener conversaciones activas.</p>
          </article>
          <article className="cyber-panel rounded-2xl p-6">
            <Bot className="size-6 text-violet-300" />
            <h3 className="mt-5 text-lg font-bold text-white">Subbots con identidad propia</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Diferentes comunidades pueden disfrutar una experiencia independiente sin perder el ecosistema de Ghost Nexora.</p>
          </article>
          <article className="cyber-panel rounded-2xl p-6">
            <Sparkles className="size-6 text-emerald-300" />
            <h3 className="mt-5 text-lg font-bold text-white">Evolución continua</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">La plataforma está preparada para incorporar nuevas funciones, estilos, juegos e idiomas conforme crece el proyecto.</p>
          </article>
        </div>
      </section>

      <section id="seguridad" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-300/15 bg-emerald-300/[.045] p-8 md:p-10">
          <div className="absolute right-[-4rem] top-[-5rem] size-64 rounded-full bg-emerald-300/[.08] blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div>
              <ShieldCheck className="size-8 text-emerald-300" />
              <p className="mt-5 text-xs font-bold uppercase tracking-[.22em] text-emerald-300">Privacidad de la plataforma</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-.035em] text-white">Una página pública debe hablar del bot, no de su infraestructura.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-400">Esta portada se limita a presentar Ghost Nexora Bot y sus capacidades. La administración, información operativa y herramientas privadas permanecen fuera de la vista pública.</p>
            </div>
            <div className="space-y-3 text-sm">
              {['Presentación pública enfocada en el producto', 'Administración separada mediante acceso privado', 'Configuraciones adaptables por comunidad', 'Sin exponer estado operativo ni información interna'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-black/10 px-4 py-3"><CheckCircle2 className="size-4 text-emerald-300" /><span className="text-slate-300">{item}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-24 pt-10 md:px-8">
        <div className="cyber-card overflow-hidden rounded-3xl p-[1px]">
          <div className="relative rounded-[calc(1.5rem-1px)] bg-[#070b16] p-8 text-center md:p-12">
            <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07]"><Bot className="size-7 text-cyan-200" /></div>
            <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-black tracking-[-.035em] text-white md:text-4xl">Ghost Nexora Bot es una plataforma social, útil y entretenida construida alrededor de WhatsApp.</h2>
            <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-400">Descubre sus funciones desde esta página. La administración del proyecto continúa reservada para usuarios autorizados.</p>
            <a href="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[.07] px-5 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-300/[.12]"><LockKeyhole className="size-4" />Acceso administrativo</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-cyan-200/[.08] bg-[#030610]/70">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-slate-500 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06]"><Bot className="size-5 text-cyan-200" /></span>
            <div><p className="font-bold tracking-wide text-slate-200">Ghost Nexora Bot</p><p className="mt-1">Ghost Developer / Nexora</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-5"><a href="#perfil" className="hover:text-cyan-200">Perfil</a><a href="#funciones" className="hover:text-cyan-200">Funciones</a><a href="#arcade" className="hover:text-cyan-200">Juegos</a><a href="#plataformas" className="hover:text-cyan-200">Plataformas</a><a href="/login" className="inline-flex items-center gap-2 text-slate-300"><LogIn className="size-4" />Acceso privado</a></div>
        </div>
      </footer>
    </main>
  )
}
