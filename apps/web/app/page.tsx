import { Activity, Bot, BrainCircuit, CheckCircle2, Coins, Download, Gamepad2, GitBranch, LayoutDashboard, LockKeyhole, LogIn, MessageSquareMore, ServerCog, ShieldCheck, UsersRound } from 'lucide-react'

const publicStages = [
  ['01', 'Ingesta Baileys', 'Recepción de eventos Multi-Device'],
  ['02', 'Serialización', 'Normalización segura de mensajes'],
  ['03', 'DB & State', 'Persistencia, identidad y configuración'],
  ['04', 'Filtros & Permisos', 'Owners, staff, admins y políticas'],
  ['05', 'Matcher & Cola', 'Resolución de comandos y aliases'],
  ['06', 'Plugin Executor', 'Ejecución modular del comando'],
  ['07', 'Socket Dispatch', 'Entrega de la respuesta a WhatsApp'],
]

const modules = [
  [BrainCircuit, 'IA y herramientas', 'Ollama opcional, búsquedas, utilidades y respuestas enriquecidas.'],
  [Download, 'Descargas', 'Flujos de audio, video, aplicaciones y contenido multimedia.'],
  [Coins, 'Nexora Economy', 'Cartera, banco, profesiones, minería, comercio y progresión.'],
  [Gamepad2, 'Arcade', 'Juegos HTML interactivos y experiencias sociales dentro de WhatsApp.'],
  [ShieldCheck, 'Moderación', 'Administración de grupos, filtros, permisos y herramientas de seguridad.'],
  [UsersRound, 'MainBot + Subbots', 'Instancias aisladas con configuración, owners y control independiente.'],
]

const purposes = [
  [UsersRound, 'Administrar comunidades', 'Centraliza herramientas para grupos: moderación, miembros inactivos, configuración, avisos, bienvenida, permisos y utilidades para administradores.'],
  [MessageSquareMore, 'Hacer el grupo más útil', 'Añade comandos, juegos, stickers, descargas, economía y herramientas sin obligar a los miembros a salir de WhatsApp para tareas cotidianas.'],
  [Bot, 'Delegar con subbots', 'Cada owner puede operar una instancia independiente. Sus grupos, sesión, configuración, métricas y acciones permanecen separados del MainBot y de otros subbots.'],
  [Activity, 'Auditar y mantener', 'El Operations Center muestra grupos conectados, estado de WhatsApp, rendimiento del pipeline y comandos lentos para detectar problemas antes de que afecten a la comunidad.'],
]

export default function Home() {
  return <main className="ops-page">
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080809]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="#inicio" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-5 text-blue-400"/></span><span><span className="block text-sm font-black tracking-wide">GHOST NEXORA BOT</span><span className="block text-[10px] uppercase tracking-[.18em] text-zinc-600">WhatsApp Operations Platform</span></span></a>
        <nav className="hidden gap-6 text-xs font-semibold text-zinc-500 md:flex"><a href="#funcionamiento" className="hover:text-white">Funcionamiento</a><a href="#arquitectura" className="hover:text-white">Arquitectura</a><a href="#modulos" className="hover:text-white">Módulos</a><a href="#seguridad" className="hover:text-white">Seguridad</a></nav>
        <a href="/login" className="ops-button-primary"><LogIn className="size-4"/>Acceder</a>
      </div>
    </header>

    <section id="inicio" className="mx-auto grid min-h-[72vh] w-full max-w-[1480px] items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-blue-500">NEXORA / WA AUTOMATION STACK</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.98] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">Administración y herramientas para comunidades de <span className="text-blue-400">WhatsApp.</span></h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-500">Ghost Nexora Bot está hecho para entender, organizar y administrar grupos desde WhatsApp. Combina moderación, economía, juegos, descargas, automatización, subbots y observabilidad en una sola plataforma, sin mezclar los datos de cada instancia.</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="#funcionamiento" className="ops-button-primary"><GitBranch className="size-4"/>Cómo funciona</a><a href="/login?mode=subbot" className="ops-button-muted"><LayoutDashboard className="size-4"/>Portal de subbot</a></div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-zinc-600"><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>TypeScript + Baileys</span><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>MainBot / subbots aislados</span><span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500"/>Web Operations Center</span></div>
      </div>

      <div className="ops-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">SYSTEM PROFILE</p><h2 className="mt-1 font-bold">Ghost Nexora Runtime</h2></div><span className="ops-badge-good">OPERATIVO</span></div>
        <div className="grid grid-cols-2 gap-px bg-white/[.06] sm:grid-cols-3">
          {[[Activity,'Pipeline','7 etapas'],[ServerCog,'Auditor','Todos los comandos'],[UsersRound,'Comunidades','Gestión de grupos'],[MessageSquareMore,'Privado','Owner / allowlist'],[BrainCircuit,'LLM','Opcional'],[LockKeyhole,'Aislamiento','Por instancia']].map(([Icon,label,value])=>{const I=Icon as typeof Activity;return <div key={String(label)} className="bg-[#101012] p-5"><I className="size-4 text-blue-500"/><p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-700">{String(label)}</p><p className="mt-1 text-sm font-bold text-zinc-200">{String(value)}</p></div>})}
        </div>
      </div>
    </section>

    <section id="funcionamiento" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <div className="mb-8 max-w-4xl"><p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-blue-500">PROPÓSITO Y OPERACIÓN</p><h2 className="mt-2 text-3xl font-black tracking-tight">¿Para qué está hecho Ghost Nexora Bot?</h2><p className="mt-3 text-sm leading-7 text-zinc-500">El objetivo principal es dar a owners, staff y administradores una capa de control sobre sus comunidades. Los miembros usan comandos dentro del grupo; los administradores configuran y moderan; el owner puede revisar desde la web qué grupos tiene cada instancia, su estado, rendimiento y acciones pendientes.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{purposes.map(([Icon,title,text])=>{const I=Icon as typeof Bot;return <article key={String(title)} className="ops-stat min-h-56"><I className="size-5 text-blue-500"/><h3 className="mt-5 text-lg font-bold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{String(text)}</p></article>})}</div>
      <div className="ops-panel mt-5 overflow-hidden"><div className="border-b border-white/[.08] px-5 py-4"><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">FLUJO NORMAL</p><h3 className="mt-1 font-bold">Del mensaje a la respuesta</h3></div><div className="grid gap-px bg-white/[.06] md:grid-cols-5">{[['1','Usuario','Envía mensaje o comando'],['2','Políticas','Valida grupo, permisos y seguridad'],['3','Router','Encuentra el comando correcto'],['4','Servicio','Ejecuta economía, juego, descarga o administración'],['5','WhatsApp','Entrega la respuesta y registra métricas']].map(([id,title,text])=><div key={id} className="bg-[#101012] p-5"><span className="font-mono text-xs font-bold text-blue-500">{id.padStart(2,'0')}</span><h4 className="mt-3 font-bold text-zinc-200">{title}</h4><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>)}</div></div>
    </section>

    <section id="arquitectura" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <div className="ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">PIPELINE DAG</p><h2 className="mt-2 text-xl font-black">Arquitectura de procesamiento</h2><p className="mt-2 max-w-3xl text-sm text-zinc-600">La misma topología que el Operations Center audita en producción. Los visitantes ven la arquitectura y el funcionamiento general; nombres de grupos, JIDs y métricas internas permanecen en los paneles autenticados.</p></div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">{publicStages.map(([id,name,text])=><article key={id} className="ops-node"><div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-blue-500">ETAPA {id}</span><span className="ops-badge-good">INSTRUMENTADA</span></div><h3 className="mt-5 font-bold">{name}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{text}</p></article>)}</div>
      </div>
    </section>

    <section id="modulos" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <div className="mb-8"><p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-blue-500">PLUGIN ECOSYSTEM</p><h2 className="mt-2 text-3xl font-black tracking-tight">Una sola plataforma, múltiples sistemas.</h2></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{modules.map(([Icon,title,text])=>{const I=Icon as typeof Bot;return <article key={String(title)} className="ops-stat min-h-48"><I className="size-5 text-blue-500"/><h3 className="mt-5 text-lg font-bold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-zinc-600">{String(text)}</p></article>})}</div>
    </section>

    <section id="seguridad" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="ops-panel p-6"><LockKeyhole className="size-5 text-blue-500"/><h2 className="mt-5 text-xl font-black">Privado bloqueado por defecto</h2><p className="mt-3 text-sm leading-6 text-zinc-500">El bot no responde, reacciona ni ejecuta comandos en chats privados no autorizados. MainBot y cada subbot mantienen su propia política de owner/allowlist.</p></article>
        <article className="ops-panel p-6"><LayoutDashboard className="size-5 text-blue-500"/><h2 className="mt-5 text-xl font-black">Operations Center por instancia</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Owners autorizados pueden revisar grupos, rendimiento y auditoría. Un subbot solo puede administrar sus propios grupos y sus propias métricas.</p></article>
      </div>
    </section>

    <footer className="mt-12 border-t border-white/[.07]"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 px-5 py-8 text-xs text-zinc-700 md:flex-row md:items-center md:justify-between md:px-8"><span>Ghost Nexora Bot · Ghost Developer / Nexora</span><span>WhatsApp automation · observabilidad · comunidad</span></div></footer>
  </main>
}
