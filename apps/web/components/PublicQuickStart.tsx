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
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-[#07111d]/95 px-4 py-3 text-sm font-bold text-cyan-50 shadow-[0_0_35px_rgba(34,211,238,.18)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200/50 hover:bg-[#0a1725]"
        aria-label="Cómo usar Ghost Nexora Bot"
      >
        <HelpCircle className="size-4 text-cyan-300" />
        ¿Cómo se usa?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#02050b]/90 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Guía rápida de Ghost Nexora Bot">
          <div className="mx-auto my-4 w-full max-w-4xl overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#07101c] shadow-[0_0_90px_rgba(34,211,238,.12)] md:my-10">
            <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,.16),transparent_40%),radial-gradient(circle_at_90%_0%,rgba(168,85,247,.15),transparent_42%)] p-6 md:p-8">
              <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-zinc-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar guía">
                <X className="size-5" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-cyan-200">
                <ShieldCheck className="size-3.5" /> Guía rápida
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-[-.035em] text-white md:text-4xl">Usar Ghost Nexora Bot es más simple de lo que parece.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-zinc-400">No necesitas entender cómo funciona internamente. Piensa en el bot como un conjunto de herramientas dentro del mismo chat: abres el menú, eliges una función y sigues las indicaciones.</p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-8">
              {steps.map(({ icon: Icon, number, title, text }) => (
                <article key={number} className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06]"><Icon className="size-5 text-cyan-300" /></span>
                    <span className="font-mono text-xs font-bold tracking-[.2em] text-violet-300/70">STEP {number}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
                </article>
              ))}
            </div>

            <div className="border-t border-white/[.08] bg-black/15 p-5 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Ejemplos rápidos</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {examples.map(([command, description]) => (
                  <div key={command} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3">
                    <code className="shrink-0 rounded-lg border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 font-mono text-xs font-bold text-cyan-200">{command}</code>
                    <ChevronRight className="size-3.5 shrink-0 text-zinc-600" />
                    <span className="text-sm text-zinc-400">{description}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-violet-300/15 bg-violet-400/[.05] p-4 text-sm leading-6 text-zinc-300">
                <strong className="text-violet-200">Consejo:</strong> si no sabes qué comando usar, empieza siempre con <code className="font-mono text-cyan-200">.menu</code>. El propio bot te muestra las opciones disponibles y cómo continuar.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
