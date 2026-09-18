'use client'

import { Fingerprint, KeyRound, LoaderCircle, LogOut, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WebLocale } from '../lib/i18n'

type Staff = {
  id: string
  label: string
  role: 'admin' | 'support'
  active: boolean
  createdAt: number
  revokedAt: number | null
}

type Session = {
  id: string
  role: 'owner' | 'admin' | 'support' | 'subbot'
  accountId: string | null
  subbotId: number | null
  createdAt: number
  lastSeen: number
  expiresAt: number
  revokedAt: number | null
}

type Passkey = {
  credentialId: string
  label: string
  deviceType: string
  backedUp: boolean
  createdAt: number
  lastUsedAt: number
}

type Snapshot = {
  ok: boolean
  role: 'owner' | 'admin' | 'support' | 'subbot'
  currentSessionId: string
  csrfToken: string
  staff: Staff[]
  sessions: Session[]
  passkeys: Passkey[]
  totp: {
    configured: boolean
    verified: boolean
    createdAt: number
    verifiedAt: number
  }
  twoFactorRequired: boolean
}

const copy = {
  es: {
    title: 'Seguridad de la cuenta',
    subtitle: 'Sesiones, Passkeys y accesos autorizados.',
    passkeys: 'Huella / Passkeys',
    passkeyText: 'La huella, rostro o PIN se valida en tu dispositivo. Ghost Nexora solo guarda la credencial criptográfica pública.',
    addPasskey: 'Registrar este dispositivo',
    addingPasskey: 'Registrando…',
    deviceName: 'Nombre para este dispositivo',
    defaultDevice: 'Mi dispositivo',
    noPasskeys: 'No hay Passkeys registradas.',
    totp: 'Aplicación Authenticator (TOTP)',
    totpText: 'Método alternativo con códigos de 6 dígitos que cambian cada 30 segundos.',
    totpStart: 'Configurar Authenticator',
    totpOpen: 'Abrir en Authenticator',
    totpSecret: 'Clave manual',
    totpCode: 'Código de 6 dígitos',
    totpConfirm: 'Confirmar y activar',
    totpActive: 'TOTP activo',
    totpRemove: 'Eliminar TOTP',
    remove: 'Eliminar',
    sessions: 'Sesiones activas',
    sessionText: 'Puedes cerrar sesiones que ya no reconozcas.',
    closeOthers: 'Cerrar las demás sesiones',
    current: 'actual',
    staff: 'Accesos de soporte y administración',
    staffText: 'Solo el Owner puede crear o revocar estos accesos. El token se muestra una sola vez.',
    label: 'Nombre',
    roleAdmin: 'Administrador',
    roleSupport: 'Soporte',
    create: 'Crear acceso',
    createdToken: 'Copia este token ahora. No volverá a mostrarse.',
    copy: 'Copiar',
    revoke: 'Revocar',
    loading: 'Cargando seguridad…',
    failed: 'No se pudo completar la operación.',
    twoFactor: '2FA para accesos privilegiados',
    twoFactorText: 'Cuando está activo, Owner, Admin y Support deben confirmar una Passkey después de usar su token.',
    enable2fa: 'Activar 2FA',
    disable2fa: 'Desactivar 2FA',
  },
  en: {
    title: 'Account security',
    subtitle: 'Sessions, Passkeys and authorized access.',
    passkeys: 'Fingerprint / Passkeys',
    passkeyText: 'Fingerprint, face or device PIN is verified locally. Ghost Nexora only stores the public cryptographic credential.',
    addPasskey: 'Register this device',
    addingPasskey: 'Registering…',
    deviceName: 'Name for this device',
    defaultDevice: 'My device',
    noPasskeys: 'No Passkeys registered.',
    totp: 'Authenticator app (TOTP)',
    totpText: 'Alternative method using 6-digit codes that change every 30 seconds.',
    totpStart: 'Set up Authenticator',
    totpOpen: 'Open in Authenticator',
    totpSecret: 'Manual key',
    totpCode: '6-digit code',
    totpConfirm: 'Confirm and enable',
    totpActive: 'TOTP active',
    totpRemove: 'Remove TOTP',
    remove: 'Remove',
    sessions: 'Active sessions',
    sessionText: 'Close sessions you no longer recognize.',
    closeOthers: 'Close other sessions',
    current: 'current',
    staff: 'Support and administrator access',
    staffText: 'Only the Owner can create or revoke these accesses. The token is shown once.',
    label: 'Name',
    roleAdmin: 'Administrator',
    roleSupport: 'Support',
    create: 'Create access',
    createdToken: 'Copy this token now. It will not be shown again.',
    copy: 'Copy',
    revoke: 'Revoke',
    loading: 'Loading security…',
    failed: 'The operation could not be completed.',
    twoFactor: '2FA for privileged access',
    twoFactorText: 'When enabled, Owner, Admin and Support must confirm a Passkey after using their token.',
    enable2fa: 'Enable 2FA',
    disable2fa: 'Disable 2FA',
  },
} as const

export function SecurityCenter({ locale }: { locale: WebLocale }) {
  const t = copy[locale]
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [createdToken, setCreatedToken] = useState('')
  const [label, setLabel] = useState('')
  const [role, setRole] = useState<'admin' | 'support'>('support')
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const intl = useMemo(() => locale === 'es' ? 'es-MX' : 'en-US', [locale])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/security', { cache: 'no-store' })
    const data = await response.json() as Snapshot
    if (!response.ok || !data.ok) throw new Error('security')
    setSnapshot(data)
  }, [])

  useEffect(() => {
    refresh().catch(() => setError(t.failed))
  }, [refresh, t.failed])

  async function action(payload: Record<string, unknown>) {
    if (!snapshot) throw new Error('snapshot')
    const response = await fetch('/api/security', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': snapshot.csrfToken,
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json() as Record<string, unknown>
    if (!response.ok || !data.ok) throw new Error(String(data.error ?? 'security'))
    return data
  }

  async function registerPasskey() {
    if (!snapshot) return
    setWorking('passkey')
    setError('')
    try {
      const name = window.prompt(t.deviceName, t.defaultDevice)?.trim() || t.defaultDevice
      const optionsResponse = await fetch('/api/auth/passkey/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'register' }),
      })
      const payload = await optionsResponse.json() as {
        ok?: boolean
        challengeId?: string
        options?: Parameters<typeof startRegistration>[0]['optionsJSON']
      }
      if (!optionsResponse.ok || !payload.ok || !payload.challengeId || !payload.options) throw new Error('options')
      const credential = await startRegistration({ optionsJSON: payload.options })
      const verifyResponse = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': snapshot.csrfToken,
        },
        body: JSON.stringify({
          mode: 'register',
          challengeId: payload.challengeId,
          response: credential,
          label: name,
        }),
      })
      const result = await verifyResponse.json() as { ok?: boolean }
      if (!verifyResponse.ok || !result.ok) throw new Error('verify')
      await refresh()
    } catch {
      setError(t.failed)
    } finally {
      setWorking('')
    }
  }

  async function createStaff() {
    setWorking('staff')
    setError('')
    setCreatedToken('')
    try {
      const result = await action({ action: 'create_staff', label, role })
      setCreatedToken(String(result.token ?? ''))
      setLabel('')
      await refresh()
    } catch {
      setError(t.failed)
    } finally {
      setWorking('')
    }
  }

  async function beginTotp() {
    setWorking('totp-begin')
    setError('')
    try {
      const result = await action({ action: 'totp_begin' })
      setTotpSetup({
        secret: String(result.secret ?? ''),
        otpauthUrl: String(result.otpauthUrl ?? ''),
      })
      setTotpCode('')
      await refresh()
    } catch {
      setError(t.failed)
    } finally {
      setWorking('')
    }
  }

  async function confirmTotp() {
    setWorking('totp-confirm')
    setError('')
    try {
      await action({ action: 'totp_confirm', code: totpCode })
      setTotpSetup(null)
      setTotpCode('')
      await refresh()
    } catch {
      setError(t.failed)
    } finally {
      setWorking('')
    }
  }

  async function run(payload: Record<string, unknown>, key: string) {
    setWorking(key)
    setError('')
    try {
      const result = await action(payload)
      if (result.revokedCurrent) {
        window.location.assign('/login')
        return
      }
      await refresh()
    } catch {
      setError(t.failed)
    } finally {
      setWorking('')
    }
  }

  if (!snapshot) {
    return <section className="ops-panel p-6 text-sm text-zinc-500">
      <LoaderCircle className="mr-2 inline size-4 animate-spin"/>{error || t.loading}
    </section>
  }

  return <div className="space-y-6">
    <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{t.title}</h2><p className="mt-1 text-xs text-zinc-500">{t.subtitle}</p></div></div>
      </div>
      {error ? <div className="border-b border-red-500/10 bg-red-500/[.05] px-5 py-3 text-sm text-red-300">{error}</div> : null}

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <article className="ops-node">
          <div className="flex items-center gap-2 font-bold text-white"><Fingerprint className="size-4 text-blue-400"/>{t.passkeys}</div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{t.passkeyText}</p>
          <button type="button" onClick={registerPasskey} disabled={working === 'passkey'} className="ops-button-primary mt-4">
            {working === 'passkey' ? <LoaderCircle className="size-4 animate-spin"/> : <Fingerprint className="size-4"/>}
            {working === 'passkey' ? t.addingPasskey : t.addPasskey}
          </button>
          <div className="mt-4 space-y-2">
            {snapshot.passkeys.length ? snapshot.passkeys.map((item) => <div key={item.credentialId} className="rounded-xl border border-white/[.07] bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-bold text-zinc-200">{item.label}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(item.lastUsedAt || item.createdAt).toLocaleString(intl)} · {item.deviceType}</p></div>
                <button type="button" onClick={() => run({ action: 'delete_passkey', credentialId: item.credentialId }, `pk:${item.credentialId}`)} className="ops-button-muted text-xs"><Trash2 className="size-3.5"/>{t.remove}</button>
              </div>
            </div>) : <p className="text-xs text-zinc-600">{t.noPasskeys}</p>}
          </div>
        </article>

        <article className="ops-node">
          <div className="flex items-center gap-2 font-bold text-white"><KeyRound className="size-4 text-blue-400"/>{t.sessions}</div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{t.sessionText}</p>
          <button type="button" onClick={() => run({ action: 'revoke_other_sessions' }, 'others')} className="ops-button-muted mt-4"><LogOut className="size-4"/>{t.closeOthers}</button>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {snapshot.sessions.filter((item) => !item.revokedAt && item.expiresAt > Date.now()).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] bg-black/20 p-3">
              <div className="min-w-0"><p className="text-xs font-bold uppercase text-zinc-300">{item.role}{item.id === snapshot.currentSessionId ? ` · ${t.current}` : ''}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(item.lastSeen).toLocaleString(intl)}</p></div>
              <button type="button" onClick={() => run({ action: 'revoke_session', id: item.id }, `session:${item.id}`)} className="ops-button-muted text-xs"><LogOut className="size-3.5"/>{t.remove}</button>
            </div>)}
          </div>
        </article>

        <article className="ops-node">
          <div className="flex items-center gap-2 font-bold text-white"><KeyRound className="size-4 text-violet-400"/>{t.totp}</div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{t.totpText}</p>
          {snapshot.totp.verified ? <div className="mt-4">
            <span className="ops-badge-good">{t.totpActive}</span>
            <button type="button" onClick={() => run({ action: 'totp_delete' }, 'totp-delete')} className="ops-button-danger mt-4"><Trash2 className="size-4"/>{t.totpRemove}</button>
          </div> : <>
            <button type="button" onClick={beginTotp} disabled={working === 'totp-begin'} className="ops-button-muted mt-4">
              {working === 'totp-begin' ? <LoaderCircle className="size-4 animate-spin"/> : <KeyRound className="size-4"/>}{t.totpStart}
            </button>
            {totpSetup ? <div className="mt-4 space-y-3 rounded-xl border border-violet-500/15 bg-violet-500/[.05] p-4">
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{t.totpSecret}</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-200">{totpSetup.secret}</code><button type="button" onClick={() => navigator.clipboard.writeText(totpSetup.secret)} className="ops-button-muted">{t.copy}</button></div></div>
              <a href={totpSetup.otpauthUrl} className="ops-button-muted w-full justify-center"><KeyRound className="size-4"/>{t.totpOpen}</a>
              <div><label htmlFor="totp-enroll" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{t.totpCode}</label><input id="totp-enroll" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="ops-input mt-2 text-center font-mono text-lg tracking-[.28em]" placeholder="000000"/></div>
              <button type="button" onClick={confirmTotp} disabled={working === 'totp-confirm' || totpCode.length !== 6} className="ops-button-primary w-full justify-center">{working === 'totp-confirm' ? <LoaderCircle className="size-4 animate-spin"/> : <ShieldCheck className="size-4"/>}{t.totpConfirm}</button>
            </div> : null}
          </>}
        </article>
      </div>
    </section>

    {snapshot.role === 'owner' ? <section className="ops-panel p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl"><div className="flex items-center gap-2 font-bold text-white"><ShieldCheck className="size-4 text-blue-400"/>{t.twoFactor}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{t.twoFactorText}</p></div>
        <button type="button" onClick={() => run({ action: 'set_2fa_required', enabled: !snapshot.twoFactorRequired }, '2fa')} className={snapshot.twoFactorRequired ? 'ops-button-danger' : 'ops-button-primary'}>
          <Fingerprint className="size-4"/>{snapshot.twoFactorRequired ? t.disable2fa : t.enable2fa}
        </button>
      </div>
    </section> : null}

    {snapshot.role === 'owner' ? <section className="ops-panel overflow-hidden">
      <div className="border-b border-white/[.08] px-5 py-5">
        <div className="flex items-center gap-3"><UserPlus className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">{t.staff}</h2><p className="mt-1 text-xs text-zinc-500">{t.staffText}</p></div></div>
      </div>
      <div className="p-5">
        <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="ops-input" placeholder={t.label}/>
          <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'support')} className="ops-input">
            <option value="support">{t.roleSupport}</option>
            <option value="admin">{t.roleAdmin}</option>
          </select>
          <button type="button" onClick={createStaff} disabled={working === 'staff' || label.trim().length < 2} className="ops-button-primary"><UserPlus className="size-4"/>{t.create}</button>
        </div>
        {createdToken ? <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-4">
          <p className="text-xs text-amber-200">{t.createdToken}</p>
          <div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-200">{createdToken}</code><button type="button" onClick={() => navigator.clipboard.writeText(createdToken)} className="ops-button-muted">{t.copy}</button></div>
        </div> : null}
        <div className="mt-5 space-y-2">
          {snapshot.staff.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/[.07] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-bold text-zinc-100">{item.label}</p><p className="mt-1 text-xs uppercase text-zinc-600">{item.role} · {item.active ? 'ACTIVE' : 'REVOKED'}</p></div>
            {item.active ? <button type="button" onClick={() => run({ action: 'revoke_staff', id: item.id }, `staff:${item.id}`)} className="ops-button-danger"><Trash2 className="size-4"/>{t.revoke}</button> : null}
          </div>)}
        </div>
      </div>
    </section> : null}
  </div>
}
