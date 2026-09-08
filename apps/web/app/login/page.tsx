import { ArrowLeft, Bot, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'
type Mode = 'admin' | 'subbot'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const params = await searchParams
  const mode: Mode = params.mode === 'subbot' ? 'subbot' : 'admin'
  const invalid = params.error === 'invalid'

  return <main className="ops-page flex min-h-screen items-center">
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-12 md:px-8 lg:grid-cols-[.9fr_1.1fr]">
      <section className="ops-panel flex min-h-[560px] flex-col justify-between p-7 md:p-9">
        <div>
          <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 transition hover:text-zinc-300"><ArrowLeft className="size-4"/>Volver al inicio</a>
          <div className="mt-14 grid size-12 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-6 text-blue-400"/></div>
          <p className="mt-7 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-blue-500">GHOST NEXORA / SECURE ACCESS</p>
          <h1 className="mt-3 max-w-lg text-4xl font-black tracking-[-.045em] md:text-5xl">Operations Center.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-500">La autenticación convierte tu token en una sesión firmada HttpOnly. El panel administrativo y cada portal de subbot mantienen permisos y datos separados.</p>
        </div>
        <div className="ops-node mt-10 min-h-0"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-blue-400"/><p className="text-xs leading-5 text-zinc-500">El token no se guarda en localStorage ni permanece visible en la URL después del inicio de sesión.</p></div></div>
      </section>

      <section className="ops-panel p-7 md:p-9">
        <div className="flex gap-1 rounded-xl border border-white/[.07] bg-[#0b0b0d] p-1">
          <a href="/login?mode=admin" className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-bold transition ${mode === 'admin' ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}><ShieldCheck className="size-4"/>Administrador</a>
          <a href="/login?mode=subbot" className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-bold transition ${mode === 'subbot' ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}><Bot className="size-4"/>Subbot</a>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg border border-white/[.08] bg-[#0c0c0e]"><KeyRound className="size-4 text-blue-400"/></span><div><p className="font-mono text-[10px] uppercase tracking-[.12em] text-zinc-700">{mode === 'admin' ? 'OWNER CONTROL CENTER' : 'INSTANCE PORTAL'}</p><h2 className="mt-1 text-xl font-black">{mode === 'admin' ? 'Acceso administrativo' : 'Acceso a tu subbot'}</h2></div></div>

          {invalid ? <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[.07] px-4 py-3 text-sm text-red-300">El token es inválido, expiró o ya no corresponde a una instancia activa.</div> : null}

          <form method="post" action="/api/auth/login" className="mt-8">
            <input type="hidden" name="mode" value={mode}/>
            <label htmlFor="token" className="text-xs font-bold uppercase tracking-wide text-zinc-500">Token de acceso</label>
            <input id="token" name="token" type="password" autoComplete="off" required minLength={12} placeholder={mode === 'admin' ? 'ADMIN_WEB_TOKEN' : 'Token generado con .subbot portal'} className="ops-input mt-2 py-3.5 font-mono"/>
            <button type="submit" className="ops-button-primary mt-4 w-full py-3.5"><LockKeyhole className="size-4"/>Acceder al Operations Center</button>
          </form>

          <div className="mt-8 border-t border-white/[.07] pt-6 text-xs leading-6 text-zinc-600">
            {mode === 'admin'
              ? <p>Solicita acceso desde el owner con <span className="font-mono text-zinc-400">.adminpanel</span>. La web valida la sesión antes de mostrar métricas, grupos o controles.</p>
              : <p>Genera tu token con <span className="font-mono text-zinc-400">.subbot portal</span>. La sesión queda vinculada exclusivamente al ID de tu instancia.</p>}
          </div>
        </div>
      </section>
    </div>
  </main>
}
