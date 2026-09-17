import { ArrowLeft, Bot, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'
import { webT } from '../../lib/i18n'
import { publicExperienceT } from '../../lib/public-experience-i18n'

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const locale = await getWebLocale()
  const t = (key: Parameters<typeof webT>[1], values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values)
  const pt = (key: Parameters<typeof publicExperienceT>[1]) => publicExperienceT(locale, key)
  const invalid = params.error === 'invalid'

  return <main className="ops-page flex min-h-screen items-center px-5 py-12 md:px-8">
    <section className="ops-panel mx-auto w-full max-w-xl overflow-hidden">
      <div className="border-b border-white/[.08] p-7 md:p-9">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 transition hover:text-white"><ArrowLeft className="size-4"/>{t('common.backHome')}</a>
        <div className="mt-10 flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-6 text-blue-400"/></span>
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-blue-400">{t('login.eyebrow')}</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em] md:text-4xl">{t('login.title')}</h1></div>
        </div>
        <p className="mt-6 text-sm leading-7 text-zinc-300">{pt('loginAutoText')}</p>
      </div>

      <div className="p-7 md:p-9">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg border border-white/[.08] bg-[#0c0c0e]"><KeyRound className="size-4 text-blue-400"/></span><div><p className="font-mono text-[10px] uppercase tracking-[.12em] text-blue-300/80">{pt('loginAutoHint')}</p><h2 className="mt-1 text-xl font-black">{pt('loginAutoTitle')}</h2></div></div>

        {invalid ? <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">{t('login.invalid')}</div> : null}

        <form method="post" action="/api/auth/login" className="mt-8">
          <label htmlFor="token" className="text-xs font-bold uppercase tracking-wide text-zinc-300">{t('login.token')}</label>
          <input id="token" name="token" type="password" autoComplete="off" required minLength={12} placeholder={pt('loginPlaceholder')} className="ops-input mt-2 py-3.5 font-mono"/>
          <button type="submit" className="ops-button-primary mt-4 w-full py-3.5"><LockKeyhole className="size-4"/>{pt('loginSubmit')}</button>
        </form>

        <div className="mt-8 grid gap-3 border-t border-white/[.07] pt-6 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><ShieldCheck className="size-4 text-emerald-400"/><p className="mt-3 text-xs leading-5 text-zinc-300">{t('login.security')}</p></div>
          <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><KeyRound className="size-4 text-blue-400"/><p className="mt-3 text-xs leading-5 text-zinc-300">{t('login.intro')}</p></div>
        </div>
      </div>
    </section>
  </main>
}
