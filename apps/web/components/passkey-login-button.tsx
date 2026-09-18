'use client'

import { Fingerprint, LoaderCircle } from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'

export function PasskeyLoginButton({ label, workingLabel, errorLabel, mode = 'login' }: {
  label: string
  workingLabel: string
  errorLabel: string
  mode?: 'login' | 'mfa'
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function authenticate() {
    setWorking(true)
    setError('')
    try {
      const optionsResponse = await fetch('/api/auth/passkey/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const optionsPayload = await optionsResponse.json() as {
        ok?: boolean
        challengeId?: string
        options?: Parameters<typeof startAuthentication>[0]['optionsJSON']
      }
      if (!optionsResponse.ok || !optionsPayload.ok || !optionsPayload.challengeId || !optionsPayload.options) {
        throw new Error('options')
      }

      const credential = await startAuthentication({ optionsJSON: optionsPayload.options })
      const verifyResponse = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          challengeId: optionsPayload.challengeId,
          response: credential,
        }),
      })
      const result = await verifyResponse.json() as { ok?: boolean; redirect?: string }
      if (!verifyResponse.ok || !result.ok || !result.redirect) throw new Error('verify')
      window.location.assign(result.redirect)
    } catch {
      setError(errorLabel)
    } finally {
      setWorking(false)
    }
  }

  return <div className="mt-3">
    <button
      type="button"
      onClick={authenticate}
      disabled={working}
      className="ops-button-muted w-full justify-center py-3.5"
    >
      {working ? <LoaderCircle className="size-4 animate-spin"/> : <Fingerprint className="size-4"/>}
      {working ? workingLabel : label}
    </button>
    {error ? <p className="mt-2 text-center text-xs text-red-300">{error}</p> : null}
  </div>
}
