import { ArrowLeft, Code2, FileText, Github, HelpCircle, LockKeyhole, Mail, Scale, ShieldCheck } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'

export const dynamic = 'force-dynamic'

export default async function LegalCenterPage() {
  const locale = await getWebLocale()
  const es = locale !== 'en'

  const documents = [
    {
      href: '/terms',
      Icon: FileText,
      title: es ? 'Términos y condiciones' : 'Terms & Conditions',
      text: es
        ? 'Reglas de uso de Ghost Nexora Bot, portal web, subbots, herramientas administrativas, descargas, IA y despliegues autohospedados.'
        : 'Rules governing Ghost Nexora Bot, the web portal, subbots, administrative tools, downloads, AI and self-hosted deployments.',
    },
    {
      href: '/privacy',
      Icon: LockKeyhole,
      title: es ? 'Política de privacidad' : 'Privacy Policy',
      text: es
        ? 'Qué información puede procesar la plataforma, por qué se procesa, cómo se protege y qué derechos corresponden a cada usuario.'
        : 'What information the platform may process, why it is processed, how it is protected and which rights users may have.',
    },
    {
      href: '/help',
      Icon: HelpCircle,
      title: es ? 'Ayuda y soporte' : 'Help & Support',
      text: es
        ? 'Guía de acceso, administración, subbots, grupos, descargas, IA, seguridad, actualizaciones y resolución de problemas.'
        : 'Access, administration, subbots, groups, downloads, AI, security, updates and troubleshooting guidance.',
    },
  ]

  return <main className="ops-page min-h-screen">
    <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#080809]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[.1]"><Scale className="size-5 text-blue-300"/></span><span><strong className="block text-sm tracking-wide text-white">GHOST NEXORA BOT</strong><span className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-300">{es ? 'Centro legal' : 'Legal center'}</span></span></a>
        <a href="/" className="ops-button-muted"><ArrowLeft className="size-4"/>{es ? 'Inicio' : 'Home'}</a>
      </div>
    </header>

    <section className="mx-auto w-full max-w-[1280px] px-5 py-14 md:px-8 lg:py-20">
      <div className="max-w-4xl">
        <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-blue-300">{es ? 'TRANSPARENCIA · PRIVACIDAD · USO RESPONSABLE' : 'TRANSPARENCY · PRIVACY · RESPONSIBLE USE'}</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-.04em] text-white md:text-6xl">{es ? 'Centro legal y de confianza' : 'Legal & Trust Center'}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-zinc-300">{es
          ? 'Documentación oficial sobre el uso del software y los servicios de Ghost Nexora Bot. Estas páginas describen de forma clara las responsabilidades del operador, del administrador de cada instancia y de sus usuarios.'
          : 'Official documentation governing use of Ghost Nexora Bot software and services. These pages clearly describe the responsibilities of the project operator, each deployment administrator and their users.'}</p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {documents.map(({ href, Icon, title, text }) => <a key={href} href={href} className="ops-panel group p-6 transition hover:-translate-y-0.5 hover:border-blue-500/30">
          <Icon className="size-6 text-blue-300"/>
          <h2 className="mt-5 text-lg font-black text-white group-hover:text-blue-200">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-300">{text}</p>
          <span className="mt-5 inline-flex font-mono text-[11px] font-bold uppercase tracking-wider text-blue-300">{es ? 'Abrir documento →' : 'Open document →'}</span>
        </a>)}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="ops-panel p-6 md:p-8">
          <div className="flex items-center gap-3"><Code2 className="size-5 text-emerald-300"/><h2 className="text-xl font-black text-white">{es ? 'Código abierto y licencia' : 'Open source & license'}</h2></div>
          <p className="mt-4 text-sm leading-7 text-zinc-300">{es
            ? 'El código fuente de Ghost Nexora Bot se distribuye bajo licencia MIT. La licencia permite usar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar y vender copias del software, conservando el aviso de copyright y la licencia correspondiente.'
            : 'Ghost Nexora Bot source code is distributed under the MIT License. The license permits use, copying, modification, merging, publication, distribution, sublicensing and sale of software copies while preserving the copyright and license notice.'}</p>
          <a href="https://github.com/Gh0stDeveloper/GhostNexoraBot" target="_blank" rel="noreferrer" className="ops-button-muted mt-5"><Github className="size-4"/>GitHub</a>
        </article>

        <article className="ops-panel p-6 md:p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-blue-300"/><h2 className="text-xl font-black text-white">{es ? 'Operador y contacto' : 'Operator & contact'}</h2></div>
          <p className="mt-4 text-sm leading-7 text-zinc-300">{es
            ? 'Ghost Nexora Bot es desarrollado y mantenido por Ghost Developer / Nexora. Las consultas de privacidad, seguridad, soporte y asuntos legales pueden enviarse por los canales oficiales.'
            : 'Ghost Nexora Bot is developed and maintained by Ghost Developer / Nexora. Privacy, security, support and legal inquiries can be sent through the official channels.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="mailto:ghostnexora@gmail.com" className="ops-button-muted"><Mail className="size-4"/>ghostnexora@gmail.com</a>
            <a href="https://t.me/Gh0stDeveloper" target="_blank" rel="noreferrer" className="ops-button-muted">Telegram · @Gh0stDeveloper</a>
          </div>
        </article>
      </div>

      <div className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-5 text-sm leading-7 text-amber-100">
        <strong>{es ? 'Aviso sobre terceros:' : 'Third-party notice:'}</strong> {es
          ? 'Ghost Nexora Bot es un proyecto independiente. Las marcas, plataformas y APIs de terceros —incluido WhatsApp/Meta— pertenecen a sus respectivos titulares y se rigen por sus propios términos y políticas.'
          : 'Ghost Nexora Bot is an independent project. Third-party brands, platforms and APIs —including WhatsApp/Meta— belong to their respective owners and are governed by their own terms and policies.'}
      </div>
    </section>
  </main>
}
