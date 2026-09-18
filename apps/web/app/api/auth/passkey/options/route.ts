import { generateAuthenticationOptions, generateRegistrationOptions, type AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  sessionPrincipal,
  verifySession,
} from '../../../../../lib/auth'
import {
  listPasskeys,
  loginRateLimited,
  requireSameOrigin,
  storeChallenge,
  subjectForPrincipal,
  webauthnContext,
} from '../../../../../lib/web-security'

async function currentSession() {
  const store = await cookies()
  return verifySession(store.get(ADMIN_SESSION_COOKIE)?.value) ?? verifySession(store.get(SUBBOT_SESSION_COOKIE)?.value)
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const body = await request.json().catch(() => ({})) as { mode?: string }
    const mode = body.mode === 'register' ? 'register' : 'login'
    const { rpID } = webauthnContext(request)

    if (mode === 'register') {
      const session = await currentSession()
      if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

      const principal = sessionPrincipal(session)
      const subject = subjectForPrincipal(principal)
      const existing = listPasskeys(subject)
      const options = await generateRegistrationOptions({
        rpName: 'Ghost Nexora Bot',
        rpID,
        userID: new TextEncoder().encode(subject),
        userName: subject,
        userDisplayName: subject,
        attestationType: 'none',
        supportedAlgorithmIDs: [-7, -257],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
          authenticatorAttachment: 'platform',
        },
        excludeCredentials: existing.map((item) => ({
          id: item.credentialId,
          transports: item.transports as AuthenticatorTransportFuture[],
        })),
      })
      const challengeId = storeChallenge('register', options.challenge, subject)
      return NextResponse.json({ ok: true, challengeId, options }, { headers: { 'cache-control': 'no-store' } })
    }

    if (loginRateLimited(request)) {
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 429 })
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: [],
    })
    const challengeId = storeChallenge('authenticate', options.challenge)
    return NextResponse.json({ ok: true, challengeId, options }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'passkey_unavailable' }, { status: 400 })
  }
}
