'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, ChevronRight, Gamepad2, HelpCircle, Languages, MessageCircle, ShieldCheck, X } from 'lucide-react'

const steps = [
  {
    icon: MessageCircle,
    number: '01',
    title: 'Abre el chat o grupo',
    text: 'Cuando Ghost Nexora Bot ya esté dentro de la conversación, no necesitas instalar nada adicional para usar sus comandos.',
  },
  {
    icon: Bot,
    number: '02',
    title: 'Escribe .menu',
    text: 'El menú organiza las funciones disponibles por categorías. Desde ahí puedes descubrir comandos sin tener que memorizarlos.',
  },
  {
    icon: Gamepad2,
    number: '03',
    title: 'Elige lo que quieres hacer',
    text: 'Puedes jugar, consultar tu economía, navegar, descargar contenido, crear stickers, usar herramientas de grupo y mucho más.',
  },
  {
    icon: Languages,
    number: '04',
    title: 'Adáptalo a tu comunidad',
    text: 'Cada grupo puede mantener configuración propia. El idioma general y el idioma de cada grupo también pueden administrarse por separado.',
  },
]

const examples = [
  ['.menu', 'Ver todas las categorías'],
  ['.pacman', 'Abrir Pac-Man interactivo'],
  ['.balance', 'Consultar tu economía Nexora'],
  ['.nav wikipedia.org', 'Abrir una página compatible'],
  ['.language', 'Consultar o cambiar el idioma'],
]

export default function PublicQuickStart() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  if (pathname !== '/') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ops-button-primary fixed bottom-5 right-5 z-40 shadow-[0_12px_35px_rgba(37,99,235,.22)]"
        aria-label="Cómo usar Ghost Nexora Bot"
      >
        <HelpCircle className="size-4" />
        ¿Cómo se usa?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#080809]/92 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Guía rápida de Ghost Nexora Bot">
          <div className="ops-panel mx-auto my-4 w-full max-w-4xl overflow-hidden md:my-10">
            <div className="relative border-b border-white/[.08] bg-[radial-gradient(circle_at_10%_0%,rgba(59,130,246,.14),transparent_42%)] p-6 md:p-8">
              <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-lg border border-white/[.09] bg-[#161619] text-zinc-400 transition hover:bg-[#1b1b1f] hover:text-white" aria-label="Cerrar guía">
                <X className="size-5" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/[.08] px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
                <ShieldCheck className="size-3.5" /> Guía rápida
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-[-.035em] text-white md:text-4xl">Usar Ghost Nexora Bot es más simple de lo que parece.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-zinc-500">Piensa en el bot como un centro de herramientas para administrar y dinamizar comunidades de WhatsApp: abre el menú, selecciona una función y sigue la respuesta del propio bot.</p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-8">
              {steps.map(({ icon: Icon, number, title, text }) => (
                <article key={number} className="ops-node">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/[.08]"><Icon className="size-5 text-blue-400" /></span>
                    <span className="font-mono text-xs font-bold tracking-[.2em] text-blue-500">STEP {number}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
                </article>
              ))}
            </div>

            <div className="border-t border-white/[.08] bg-black/15 p-5 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-500">Ejemplos rápidos</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {examples.map(([command, description]) => (
                  <div key={command} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.02] px-4 py-3">
                    <code className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/[.08] px-2.5 py-1 font-mono text-xs font-bold text-blue-300">{command}</code>
                    <ChevronRight className="size-3.5 shrink-0 text-zinc-700" />
                    <span className="text-sm text-zinc-500">{description}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/[.05] p-4 text-sm leading-6 text-zinc-300">
                <strong className="text-blue-300">Consejo:</strong> si no sabes qué comando usar, empieza con <code className="font-mono text-blue-300">.menu</code>. El propio bot muestra las opciones disponibles y cómo continuar.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
