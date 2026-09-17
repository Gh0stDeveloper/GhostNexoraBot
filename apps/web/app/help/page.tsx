import { ArrowLeft, Bot, BrainCircuit, Download, Github, HelpCircle, KeyRound, LifeBuoy, Mail, MessageSquareMore, ServerCog, ShieldCheck, TerminalSquare, UsersRound } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'

export const dynamic = 'force-dynamic'

export default async function HelpPage() {
  const locale = await getWebLocale()
  const es = locale !== 'en'

  const topics = es ? [
    { Icon: KeyRound, title: 'Acceso y sesiones', text: 'El panel administrativo requiere la credencial configurada por el operador. Los portales de subbots usan tokens vinculados a un subbot concreto y con fecha de expiración.' },
    { Icon: UsersRound, title: 'Grupos y comunidades', text: 'Desde el panel se pueden sincronizar grupos, revisar JID, nombre, miembros, administradores, actividad y ejecutar acciones permitidas por los permisos del bot.' },
    { Icon: Bot, title: 'Subbots', text: 'Cada subbot mantiene su propio acceso y configuración. Las funciones disponibles pueden variar respecto de la instancia principal según aislamiento, permisos y servicios instalados.' },
    { Icon: BrainCircuit, title: 'IA y Ollama', text: 'Las funciones de IA solo están disponibles cuando el servicio y modelo necesarios están instalados y habilitados. Las respuestas deben revisarse antes de usarse para decisiones importantes.' },
    { Icon: Download, title: 'Descargas oficiales', text: 'La sección Downloads muestra los paquetes disponibles para Windows, Android y Linux junto con versión, arquitectura, hash y estado de firma cuando esa información existe.' },
    { Icon: ServerCog, title: 'Servidor y operación', text: 'El administrador del VPS debe mantener Node, dependencias, Nginx/TLS, firewall, permisos, almacenamiento y servicios auxiliares correctamente configurados y actualizados.' },
    { Icon: MessageSquareMore, title: 'Comandos y WhatsApp', text: 'La disponibilidad de comandos depende de la versión, categoría habilitada, permisos del grupo, servicios externos y configuración de la instancia. Algunas funciones requieren privilegios de administrador.' },
    { Icon: ShieldCheck, title: 'Seguridad y privacidad', text: 'No compartas sesiones, tokens ni archivos de autenticación. Ante una posible exposición, revoca el acceso, rota secretos y revisa los logs antes de volver a habilitar el servicio.' },
  ] : [
    { Icon: KeyRound, title: 'Access & sessions', text: 'The administrative dashboard requires the credential configured by the operator. Subbot portals use tokens tied to a specific subbot and expiration date.' },
    { Icon: UsersRound, title: 'Groups & communities', text: 'The dashboard can synchronize groups, inspect JID, name, members, admins and activity, and execute actions allowed by the bot’s permissions.' },
    { Icon: Bot, title: 'Subbots', text: 'Each subbot keeps its own access and configuration. Available features may differ from the main instance depending on isolation, permissions and installed services.' },
    { Icon: BrainCircuit, title: 'AI & Ollama', text: 'AI features are available only when the required service and model are installed and enabled. Review generated output before relying on it for important decisions.' },
    { Icon: Download, title: 'Official downloads', text: 'The Downloads section lists available Windows, Android and Linux packages together with version, architecture, hash and signing state where available.' },
    { Icon: ServerCog, title: 'Server operations', text: 'The VPS administrator should keep Node, dependencies, Nginx/TLS, firewall, permissions, storage and supporting services correctly configured and current.' },
    { Icon: MessageSquareMore, title: 'Commands & WhatsApp', text: 'Command availability depends on version, enabled category, group permissions, external services and instance configuration. Some features require administrator privileges.' },
    { Icon: ShieldCheck, title: 'Security & privacy', text: 'Do not share sessions, tokens or authentication files. If exposure is suspected, revoke access, rotate secrets and review logs before restoring service.' },
  ]

  const troubleshooting = es ? [
    ['La actualización falla al compilar', 'Revisa /tmp/ghost-nexora-build.log. El actualizador detiene el despliegue si TypeScript o Next.js no compilan correctamente.'],
    ['La web no muestra grupos', 'Comprueba que el bot esté conectado, que la instancia correcta esté seleccionada y ejecuta una sincronización desde el panel. La información depende de groupFetchAllParticipating y de la base de operaciones.'],
    ['Un subbot no tiene todos los comandos', 'Es esperado cuando una capacidad está deshabilitada o aislada. Los subbots no deben heredar automáticamente estados, cooldowns, credenciales o servicios de la instancia principal.'],
    ['La IA no aparece', 'Verifica que Ollama esté instalado, activo y que exista un modelo configurado. Si Ollama no está disponible, los comandos que dependen de él pueden ocultarse.'],
    ['Un instalador no aparece en Downloads', 'La página refleja el catálogo oficial de artefactos. Si un formato no fue publicado para la versión actual, se mostrará como no disponible.'],
    ['WhatsApp desconecta la sesión', 'Revisa los logs del servicio, estado de red, versión de Baileys y archivos de sesión. Evita copiar o reutilizar sesiones entre instancias sin entender el impacto.'],
  ] : [
    ['Update fails during build', 'Check /tmp/ghost-nexora-build.log. The updater stops deployment when TypeScript or Next.js fails to compile.'],
    ['The web UI shows no groups', 'Verify that the bot is connected, the correct instance is selected and trigger synchronization from the dashboard. Data depends on groupFetchAllParticipating and the operations database.'],
    ['A subbot has fewer commands', 'This is expected when a capability is disabled or isolated. Subbots should not automatically inherit states, cooldowns, credentials or services from the main instance.'],
    ['AI features are missing', 'Verify Ollama is installed and running and that a model is configured. Commands that depend on Ollama may be hidden when it is unavailable.'],
    ['A package is missing from Downloads', 'The page reflects the official artifact catalog. If a format was not published for the current version, it is shown as unavailable.'],
    ['WhatsApp session disconnects', 'Review service logs, network state, Baileys version and session files. Avoid copying or reusing sessions between instances without understanding the impact.'],
  ]

  return <main className="ops-page min-h-screen">
    <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#080809]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[.1]"><HelpCircle className="size-5 text-blue-300"/></span><span><strong className="block text-sm text-white">{es ? 'Ayuda y soporte' : 'Help & Support'}</strong><span className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-300">Ghost Nexora Bot</span></span></a>
        <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{es ? 'Inicio' : 'Home'}</a>
      </div>
    </header>

    <section className="mx-auto w-full max-w-[1320px] px-5 py-14 md:px-8 lg:py-20">
      <div className="max-w-4xl">
        <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-blue-300">{es ? 'DOCUMENTACIÓN OPERATIVA' : 'OPERATIONAL DOCUMENTATION'}</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-.04em] text-white md:text-6xl">{es ? 'Centro de ayuda' : 'Help Center'}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-zinc-300">{es
          ? 'Referencia rápida para operar Ghost Nexora Bot, el panel administrativo, los subbots, descargas, IA y despliegues en VPS. Para documentación técnica de desarrollo, consulta también el repositorio oficial.'
          : 'Quick reference for operating Ghost Nexora Bot, the administrative dashboard, subbots, downloads, AI and VPS deployments. For development documentation, also see the official repository.'}</p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topics.map(({ Icon, title, text }) => <article key={title} className="ops-stat min-h-60">
          <Icon className="size-5 text-blue-300"/>
          <h2 className="mt-5 text-lg font-black text-white">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-300">{text}</p>
        </article>)}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <article className="ops-panel overflow-hidden">
          <div className="border-b border-white/[.08] px-6 py-5"><div className="flex items-center gap-3"><LifeBuoy className="size-5 text-blue-300"/><div><h2 className="font-black text-white">{es ? 'Solución de problemas' : 'Troubleshooting'}</h2><p className="mt-1 text-sm text-zinc-400">{es ? 'Comprobaciones habituales antes de reportar un fallo.' : 'Common checks before reporting a failure.'}</p></div></div></div>
          <div className="divide-y divide-white/[.06]">{troubleshooting.map(([title, text]) => <section key={title} className="px-6 py-5"><h3 className="font-bold text-zinc-100">{title}</h3><p className="mt-2 text-sm leading-7 text-zinc-300">{text}</p></section>)}</div>
        </article>

        <div className="space-y-5">
          <article className="ops-panel p-6">
            <TerminalSquare className="size-5 text-emerald-300"/>
            <h2 className="mt-4 text-lg font-black text-white">{es ? 'Actualizar una instalación existente' : 'Update an existing installation'}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300">{es ? 'En instalaciones administradas con el CLI oficial:' : 'For deployments managed with the official CLI:'}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-white/[.08] bg-black/35 p-4 font-mono text-sm text-emerald-200"><code>sudo ghostnexorabot update</code></pre>
            <p className="mt-3 text-xs leading-6 text-zinc-400">{es ? 'Antes de actualizar producción, conserva tus datos persistentes y revisa el resultado del build.' : 'Before updating production, preserve persistent data and review the build result.'}</p>
          </article>

          <article className="ops-panel p-6">
            <ShieldCheck className="size-5 text-blue-300"/>
            <h2 className="mt-4 text-lg font-black text-white">{es ? 'Antes de pedir soporte' : 'Before requesting support'}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-300">
              <li>{es ? 'Indica la versión o commit que estás ejecutando.' : 'Include the version or commit you are running.'}</li>
              <li>{es ? 'Describe qué esperabas y qué ocurrió.' : 'Describe what you expected and what happened.'}</li>
              <li>{es ? 'Incluye el error relevante, pero elimina tokens, cookies, QR y credenciales.' : 'Include the relevant error, but remove tokens, cookies, QR codes and credentials.'}</li>
              <li>{es ? 'Aclara si ocurre en la instancia principal, un subbot o la web.' : 'State whether it affects the main instance, a subbot or the web UI.'}</li>
            </ul>
          </article>
        </div>
      </div>

      <section className="mt-10 ops-panel p-6 md:p-8">
        <h2 className="text-2xl font-black text-white">{es ? 'Canales oficiales' : 'Official channels'}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">{es ? 'Para soporte, incidencias, privacidad o seguridad utiliza canales oficiales. Nunca publiques credenciales o sesiones en un issue público.' : 'Use official channels for support, incidents, privacy or security. Never post credentials or sessions in a public issue.'}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="mailto:ghostnexora@gmail.com" className="ops-button-muted"><Mail className="size-4"/>ghostnexora@gmail.com</a>
          <a href="https://t.me/Gh0stDeveloper" target="_blank" rel="noreferrer" className="ops-button-muted">Telegram · @Gh0stDeveloper</a>
          <a href="https://github.com/Gh0stDeveloper/GhostNexoraBot" target="_blank" rel="noreferrer" className="ops-button-muted"><Github className="size-4"/>GitHub</a>
          <a href="/legal" className="ops-button-muted"><ShieldCheck className="size-4"/>{es ? 'Centro legal' : 'Legal center'}</a>
        </div>
      </section>
    </section>
  </main>
}
