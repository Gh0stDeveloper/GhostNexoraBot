import { FileText, HelpCircle, LockKeyhole, Scale, ShieldCheck } from 'lucide-react'

type Props = { locale: string }

export function LegalFooter({ locale }: Props) {
  const es = locale !== 'en'
  const links = [
    { href: '/help', label: es ? 'Ayuda' : 'Help', Icon: HelpCircle },
    { href: '/legal', label: es ? 'Centro legal' : 'Legal center', Icon: Scale },
    { href: '/terms', label: es ? 'Términos y condiciones' : 'Terms & Conditions', Icon: FileText },
    { href: '/privacy', label: es ? 'Política de privacidad' : 'Privacy Policy', Icon: LockKeyhole },
  ]

  return <footer className="border-t border-white/[.08] bg-[#09090b]">
    <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5 px-5 py-7 text-xs md:px-8 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-bold text-zinc-100">© {new Date().getFullYear()} Ghost Nexora Bot · Ghost Developer / Nexora</p>
        <p className="mt-1 max-w-2xl leading-5 text-zinc-400">
          {es
            ? 'Proyecto de software distribuido bajo licencia MIT. WhatsApp y demás servicios de terceros conservan sus propias marcas, términos y políticas.'
            : 'Software project distributed under the MIT License. WhatsApp and other third-party services retain their own trademarks, terms, and policies.'}
        </p>
      </div>
      <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label={es ? 'Enlaces legales y de ayuda' : 'Legal and help links'}>
        {links.map(({ href, label, Icon }) => <a key={href} href={href} className="inline-flex items-center gap-2 font-semibold text-zinc-300 transition hover:text-blue-300">
          <Icon className="size-3.5 text-blue-400"/>{label}
        </a>)}
        <a href="https://github.com/Gh0stDeveloper/GhostNexoraBot/blob/main/SECURITY.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-zinc-300 transition hover:text-blue-300">
          <ShieldCheck className="size-3.5 text-emerald-400"/>{es ? 'Seguridad' : 'Security'}
        </a>
      </nav>
    </div>
  </footer>
}
