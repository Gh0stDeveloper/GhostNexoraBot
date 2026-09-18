import { ArrowLeft, Bot, LockKeyhole } from 'lucide-react'
import { PasskeyLoginButton } from '../../components/passkey-login-button'
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
  const reauth = params.error === 'reauth'

  return <main className="ops-page flex min-h-screen items-center px-5 py-12 md:px-8">
    <section className="ops-panel mx-auto w-full max-w-md overflow-hidden">
      <div className="p-7 md:p-9">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-white">
          <ArrowLeft className="size-4"/>{t('common.backHome')}
        </a>

        <div className="mt-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-blue-500/20 bg-blue-500/[.08]">
            <Bot className="size-7 text-blue-400"/>
          </span>
          <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-blue-400">{pt('loginAutoHint')}</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-white">{pt('loginAutoTitle')}</h1>
          <p className="mt-2 text-sm text-zinc-500">{pt('loginAutoText')}</p>
        </div>

        {invalid ? <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-center text-sm text-red-300">{t('login.invalid')}</div> : null}
        {reauth ? <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[.07] px-4 py-3 text-center text-sm text-amber-200">{pt('loginReauth')}</div> : null}

        <form method="post" action="/api/auth/login" className="mt-7">
          <label htmlFor="token" className="text-xs font-bold uppercase tracking-wide text-zinc-300">{t('login.token')}</label>
          <input
            id="token"
            name="token"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            placeholder={pt('loginPlaceholder')}
            className="ops-input mt-2 py-3.5 font-mono"
          />
          <button type="submit" className="ops-button-primary mt-4 w-full justify-center py-3.5">
            <LockKeyhole className="size-4"/>{pt('loginSubmit')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[.16em] text-zinc-700">
          <span className="h-px flex-1 bg-white/[.07]"/><span>Passkey</span><span className="h-px flex-1 bg-white/[.07]"/>
        </div>

        <PasskeyLoginButton
          label={pt('loginPasskey')}
          workingLabel={pt('loginPasskeyWorking')}
          errorLabel={pt('loginPasskeyError')}
        />
      </div>
    </section>
  </main>
}
