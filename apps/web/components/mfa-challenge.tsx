'use client'

import { KeyRound, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PasskeyLoginButton } from './passkey-login-button'

type MfaStatus = {
  ok: boolean
  passkey: boolean
  totp: boolean
}

export function MfaChallenge({ locale, passkeyLabel, workingLabel, passkeyError }: {
  locale: 'es' | 'en'
  passkeyLabel: string
  workingLabel: string
  passkeyError: string
}) {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const copy = locale === 'es'
    ? {
      totp: 'Código del autenticador',
      placeholder: '000000',
      confirm: 'Confirmar código',
      invalid: 'No se pudo validar el segundo factor.',
      loading: 'Cargando métodos de seguridad…',
    }
    : {
      totp: 'Authenticator code',
      placeholder: '000000',
      confirm: 'Confirm code',
      invalid: 'The second factor could not be verified.',
      loading: 'Loading security methods…',
    }

  useEffect(() => {
    fetch('/api/auth/mfa/status', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as MfaStatus
        if (!response.ok || !data.ok) throw new Error('mfa')
        setStatus(data)
      })
      .catch(() => setError(copy.invalid))
  }, [copy.invalid])

  async function verifyTotp() {
    setWorking(true)
    setError('')
    try {
      const response = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const result = await response.json() as { ok?: boolean; redirect?: string }
      if (!response.ok || !result.ok || !result.redirect) throw new Error('totp')
      window.location.assign(result.redirect)
    } catch {
      setError(copy.invalid)
    } finally {
      setWorking(false)
    }
  }

  if (!status) {
    return <div className="mt-7 text-center text-sm text-zinc-500">
      <LoaderCircle className="mr-2 inline size-4 animate-spin"/>{error || copy.loading}
    </div>
  }

  return <div className="mt-7 space-y-4">
    {status.passkey ? <PasskeyLoginButton
      label={passkeyLabel}
      workingLabel={workingLabel}
      errorLabel={passkeyError}
      mode="mfa"
    /> : null}

    {status.passkey && status.totp ? <div className="flex items-center gap-3 text-[10px] uppercase tracking-[.16em] text-zinc-700">
      <span className="h-px flex-1 bg-white/[.07]"/><span>o</span><span className="h-px flex-1 bg-white/[.07]"/>
    </div> : null}

    {status.totp ? <div>
      <label htmlFor="totp" className="text-xs font-bold uppercase tracking-wide text-zinc-300">{copy.totp}</label>
      <input
        id="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={copy.placeholder}
        className="ops-input mt-2 py-3.5 text-center font-mono text-xl tracking-[.3em]"
      />
      <button type="button" disabled={working || code.length !== 6} onClick={verifyTotp} className="ops-button-primary mt-3 w-full justify-center py-3.5">
        {working ? <LoaderCircle className="size-4 animate-spin"/> : <KeyRound className="size-4"/>}{copy.confirm}
      </button>
    </div> : null}

    {error ? <p className="text-center text-xs text-red-300">{error}</p> : null}
  </div>
}
