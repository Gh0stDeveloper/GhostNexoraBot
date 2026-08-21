import { ArrowLeft, Bot, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Mode = 'admin' | 'subbot'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const params = await searchParams
  const mode: Mode = params.mode === 'subbot' ? 'subbot' : 'admin'
  const invalid = params.error === 'invalid'

  return <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-5 py-12 md:px-8">
    <div className="grid w-full gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-stretch">
      <section className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[.025] p-7 md:p-9">
        <div>
          <a href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"><ArrowLeft className="size-4"/>Volver al inicio</a>
          <div className="mt-12 grid size-12 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-400/[.08]"><Bot className="size-6 text-[var(--accent)]"/></div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[.22em] text-[var(--accent)]">Ghost Nexora Access</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] md:text-5xl">Acceso privado sin tokens en la URL.</h1>
          <p className="mt-5 max-w-xl leading-7 text-zinc-400">Introduce el token que recibiste desde el bot. La web crea una sesión firmada en una cookie HttpOnly y elimina la necesidad de navegar con credenciales visibles.</p>
        </div>
        <div className="mt-10 rounded-2xl border border-white/[.08] bg-black/20 p-4 text-sm text-zinc-400">
          <div className="flex gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"/><p>El token no se guarda en localStorage ni se incorpora a la URL después del inicio de sesión.</p></div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#090d12]/90 p-7 shadow-2xl shadow-black/30 md:p-9">
        <div className="flex gap-2 rounded-2xl border border-white/[.08] bg-black/20 p-1.5">
          <a href="/login?mode=admin" className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === 'admin' ? 'bg-white/[.09] text-white' : 'text-zinc-500 hover:text-white'}`}><ShieldCheck className="size-4"/>Administrador</a>
          <a href="/login?mode=subbot" className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === 'subbot' ? 'bg-white/[.09] text-white' : 'text-zinc-500 hover:text-white'}`}><Bot className="size-4"/>Subbot</a>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.04]"><KeyRound className="size-5 text-[var(--accent)]"/></div><div><p className="text-sm text-zinc-500">{mode === 'admin' ? 'Owner control center' : 'Portal de instancia'}</p><h2 className="text-xl font-semibold">{mode === 'admin' ? 'Iniciar sesión como administrador' : 'Iniciar sesión en tu subbot'}</h2></div></div>

          {invalid ? <div className="mt-6 rounded-xl border border-red-400/20 bg-red-400/[.07] px-4 py-3 text-sm text-red-200">El token es inválido, expiró o ya no corresponde a una instancia activa.</div> : null}

          <form method="post" action="/api/auth/login" className="mt-7">
            <input type="hidden" name="mode" value={mode}/>
            <label htmlFor="token" className="text-sm font-medium text-zinc-300">Token de acceso</label>
            <input id="token" name="token" type="password" autoComplete="off" required minLength={12} placeholder={mode === 'admin' ? 'ADMIN_WEB_TOKEN' : 'Token generado con .subbot portal'} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 font-mono text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-400/10"/>
            <button type="submit" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-strong)]"><LockKeyhole className="size-4"/>Acceder</button>
          </form>

          <div className="mt-7 border-t border-white/[.08] pt-6 text-sm leading-6 text-zinc-500">
            {mode === 'admin'
              ? <p>Solicita el acceso desde el chat privado del bot con <span className="font-mono text-zinc-300">.adminpanel</span>. El bot te mostrará la URL del login y el token por separado.</p>
              : <p>Genera un token desde WhatsApp con <span className="font-mono text-zinc-300">.subbot portal</span>. El token solo puede abrir la instancia asociada a tu cuenta.</p>}
          </div>
        </div>
      </section>
    </div>
  </main>
}
