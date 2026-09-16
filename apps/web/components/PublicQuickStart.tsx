'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, ChevronRight, Gamepad2, HelpCircle, Languages, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { useWebI18n } from './i18n-provider'

export default function PublicQuickStart() {
  const pathname = usePathname()
  const { t } = useWebI18n()
  const [open, setOpen] = useState(false)
  if (pathname !== '/') return null

  const steps = [
    { icon: MessageCircle, number: '01', title: t('quick.step1.title'), text: t('quick.step1.text') },
    { icon: Bot, number: '02', title: t('quick.step2.title'), text: t('quick.step2.text') },
    { icon: Gamepad2, number: '03', title: t('quick.step3.title'), text: t('quick.step3.text') },
    { icon: Languages, number: '04', title: t('quick.step4.title'), text: t('quick.step4.text') },
  ]
  const examples = [
    ['.menu', t('quick.example.menu')],
    ['.pacman', t('quick.example.pacman')],
    ['.balance', t('quick.example.balance')],
    ['.nav wikipedia.org', t('quick.example.nav')],
    ['.language', t('quick.example.language')],
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ops-button-primary fixed bottom-5 right-5 z-40 shadow-[0_12px_35px_rgba(37,99,235,.22)]"
        aria-label={t('quick.aria')}
      >
        <HelpCircle className="size-4" />
        {t('quick.button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#080809]/92 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={t('quick.dialogAria')}>
          <div className="ops-panel mx-auto my-4 w-full max-w-4xl overflow-hidden md:my-10">
            <div className="relative border-b border-white/[.08] bg-[radial-gradient(circle_at_10%_0%,rgba(59,130,246,.14),transparent_42%)] p-6 md:p-8">
              <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-lg border border-white/[.09] bg-[#161619] text-zinc-400 transition hover:bg-[#1b1b1f] hover:text-white" aria-label={t('quick.closeAria')}>
                <X className="size-5" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/[.08] px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
                <ShieldCheck className="size-3.5" /> {t('quick.badge')}
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-[-.035em] text-white md:text-4xl">{t('quick.title')}</h2>
              <p className="mt-3 max-w-2xl leading-7 text-zinc-500">{t('quick.intro')}</p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-8">
              {steps.map(({ icon: Icon, number, title, text }) => (
                <article key={number} className="ops-node">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/[.08]"><Icon className="size-5 text-blue-400" /></span>
                    <span className="font-mono text-xs font-bold tracking-[.2em] text-blue-500">{t('quick.step', { number })}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
                </article>
              ))}
            </div>

            <div className="border-t border-white/[.08] bg-black/15 p-5 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-500">{t('quick.examples')}</p>
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
                <strong className="text-blue-300">{t('quick.tipLabel')}</strong> {t('quick.tipText')}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
