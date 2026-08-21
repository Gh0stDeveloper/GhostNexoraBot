import {
  Activity,
  Bot,
  Braces,
  Download,
  Github,
  Link2,
  MessageSquareMore,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
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
    const data = await response.json() as Health
    return data
  } catch {
    return { ok: false, connected: false }
  }
}

const features: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Link2, title: 'Multi-Device pairing', text: 'Vinculación por número y código de emparejamiento, con sesión persistente y QR de respaldo.' },
  { icon: Download, title: 'Media downloads', text: 'YouTube con búsqueda y calidades, SoundCloud, MediaFire y plataformas sociales públicas mediante adaptadores aislados.' },
  { icon: WandSparkles, title: 'Stickers', text: 'Convierte imágenes, GIFs y videos a stickers WebP compatibles con WhatsApp.' },
  { icon: ShieldCheck, title: 'Group controls', text: 'Moderación, menciones, enlace, apertura/cierre y permisos compatibles con identidades PN/LID.' },
  { icon: MessageSquareMore, title: 'Smart reactions', text: 'Feedback visual para comandos y reacciones conversacionales opcionales.' },
  { icon: Server, title: 'VPS ready', text: 'Instalación automatizada, systemd, health endpoint y actualización reproducible.' },
]

const commandGroups = [
  ['General', '.menu · .ping · .info · .prefix'],
  ['Stickers', '.sticker · .s · .toimg'],
  ['Search & Play', '.yts · .play · .playvideo · .soundcloud'],
  ['YouTube', '.ytformats · .ytmp3 · .ytmp4'],
  ['Downloads', '.tiktok · .instagram · .facebook · .twitter · .mediafire'],
  ['Groups', '.tagall · .hidetag · .link · .group · .kick · .promote · .demote'],
  ['Owner', '.setprefix · .status · .restart'],
]

function uptime(seconds = 0) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

export default async function Home() {
  const health = await getHealth()
  const online = health.connected

  return (
    <main className="relative overflow-hidden">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 md:px-8">
        <a href="#top" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] shadow-[0_0_40px_rgba(86,243,154,.12)]">
            <Bot className="size-5 text-[var(--accent)]" />
          </span>
          <span>Ghost Nexora Bot</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-[var(--muted)] md:flex">
          <a className="transition hover:text-white" href="#features">Características</a>
          <a className="transition hover:text-white" href="#commands">Comandos</a>
          <a className="transition hover:text-white" href="#install">Instalación</a>
        </nav>
        <a
          href="https://github.com/Gh0stDeveloper/GhostNexoraBot"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium transition hover:bg-white/[0.08]"
        >
          <Github className="size-4" /> GitHub
        </a>
      </header>

      <section id="top" className="mx-auto grid min-h-[72vh] w-full max-w-7xl items-center gap-14 px-5 py-16 md:px-8 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300">
            <span className={`size-2 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]' : 'bg-zinc-600'}`} />
            {online ? 'WhatsApp conectado' : 'Bot sin conexión detectada'}
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            WhatsApp automation,
            <span className="block bg-gradient-to-r from-emerald-300 via-emerald-400 to-cyan-300 bg-clip-text text-transparent">sin una base improvisada.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            Ghost Nexora Bot combina Baileys Multi-Device, comandos modulares, stickers, búsqueda y descargas, controles de grupo y una web operativa en un monorepo preparado para VPS.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#install" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[var(--accent-strong)]">
              <Terminal className="size-4" /> Instalar en VPS
            </a>
            <a href="#commands" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold transition hover:bg-white/[0.08]">
              <Braces className="size-4" /> Ver comandos
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 rounded-[2.5rem] bg-emerald-400/[0.05] blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080c10]/90 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/8 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4 text-[var(--accent)]" /> Runtime</div>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-[var(--muted)]">v1.0.0</span>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              {[
                ['WhatsApp', online ? 'Connected' : 'Offline'],
                ['Prefix', health.prefix ?? '.'],
                ['Uptime', online ? uptime(health.uptimeSeconds) : '—'],
                ['Session', 'Persistent Multi-Device'],
                ['Web', 'Next.js 16'],
                ['Styling', 'Tailwind CSS 4'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
                  <dt className="text-[var(--muted)]">{label}</dt>
                  <dd className="font-mono text-xs text-zinc-200">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Architecture first</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Una base preparada para crecer.</h2>
          <p className="mt-4 leading-7 text-[var(--muted)]">Cada responsabilidad importante vive en su propio módulo para que agregar comandos, proveedores o persistencia no convierta el proyecto en un único archivo inmantenible.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 transition hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.04]">
              <span className="grid size-10 place-items-center rounded-xl border border-emerald-300/10 bg-emerald-400/[0.08]"><Icon className="size-5 text-[var(--accent)]" /></span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="commands" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="rounded-3xl border border-white/[0.08] bg-[#090d12]/80 p-6 md:p-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Command surface</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Prefijo simple. Módulos claros.</h2>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2 font-mono text-sm text-zinc-300">default prefix: <span className="text-[var(--accent)]">.</span></div>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {commandGroups.map(([name, list]) => (
              <div key={name} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-sm font-semibold">{name}</p>
                <p className="mt-2 break-words font-mono text-xs leading-6 text-[var(--muted)]">{list}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto w-full max-w-7xl px-5 py-20 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><Sparkles className="size-5 text-[var(--accent)]" /></div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Una instalación, no una lista de veinte pasos.</h2>
            <p className="mt-4 leading-7 text-[var(--muted)]">El script instala dependencias del sistema, compila el monorepo, prepara la sesión, instala servicios systemd y deja el bot listo para arrancar automáticamente con el servidor.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070a0d] shadow-2xl shadow-black/20">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 text-xs text-[var(--muted)]"><Terminal className="size-4" /> Ubuntu / Debian</div>
            <pre className="code-scroll overflow-x-auto p-5 text-sm leading-7 text-zinc-300"><code><span className="text-[var(--accent)]">$</span> curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash</code></pre>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 border-t border-white/[0.07] px-5 py-8 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between md:px-8">
        <p>Ghost Developer / Nexora · Ghost Nexora Bot</p>
        <a className="inline-flex items-center gap-2 transition hover:text-white" href="https://github.com/Gh0stDeveloper/GhostNexoraBot"><Github className="size-4" /> Source on GitHub</a>
      </footer>
    </main>
  )
}
