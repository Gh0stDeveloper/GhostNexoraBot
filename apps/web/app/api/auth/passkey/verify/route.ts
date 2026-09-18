import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createOwnerSession,
  createStaffSession,
  createSubbotSession,
  resolveSubbotPasskeyAccess,
  sessionPrincipal,
  signSession,
  verifySession,
} from '../../../../../lib/auth'
import {
  clearLoginFailures,
  consumeChallenge,
  findPasskey,
  principalForPasskey,
  recordLoginFailure,
  requireMutationSecurity,
  requireSameOrigin,
  savePasskey,
  subjectForPrincipal,
  updatePasskeyCounter,
  webauthnContext,
} from '../../../../../lib/web-security'

async function currentSession() {
  const store = await cookies()
  return verifySession(store.get(ADMIN_SESSION_COOKIE)?.value) ?? verifySession(store.get(SUBBOT_SESSION_COOKIE)?.value)
}

type PasskeyVerifyBody = {
  mode?: 'register' | 'login'
  challengeId?: string
  response?: RegistrationResponseJSON | AuthenticationResponseJSON
  label?: string
}

function loginFailure(request: Request, status = 400) {
  recordLoginFailure(request)
  return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as PasskeyVerifyBody | null
  if (!body?.challengeId || !body.response) return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })

  const { origin, rpID } = webauthnContext(request)

  if (body.mode === 'register') {
    const session = await currentSession()
    if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    try {
      requireMutationSecurity(request, session, request.headers.get('x-csrf-token'))
      const principal = sessionPrincipal(session)
      const subject = subjectForPrincipal(principal)
      const pending = consumeChallenge(body.challengeId, 'register')
      if (!pending || pending.subject !== subject) return NextResponse.json({ ok: false, error: 'invalid_challenge' }, { status: 400 })

      const verification = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      })
      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ ok: false, error: 'registration_failed' }, { status: 400 })
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
      savePasskey({
        credentialId: credential.id,
        principal,
        publicKey: credential.publicKey,
        webauthnUserId: verification.registrationInfo.userVerified
          ? subject
          : subject,
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports,
        label: body.label,
      })
      return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
    } catch {
      return NextResponse.json({ ok: false, error: 'registration_failed' }, { status: 400 })
    }
  }

  try {
    requireSameOrigin(request)
  } catch {
    return loginFailure(request)
  }

  const pending = consumeChallenge(body.challengeId, 'authenticate')
  if (!pending) return loginFailure(request)

  const credentialId = String((body.response as AuthenticationResponseJSON).id ?? '')
  const passkey = findPasskey(credentialId)
  if (!passkey) return loginFailure(request)

  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response as AuthenticationResponseJSON,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    })
    if (!verification.verified) return loginFailure(request)

    const principal = principalForPasskey(passkey)
    if (!principal) return loginFailure(request)

    let session
    if (principal.role === 'owner') {
      session = createOwnerSession(request)
    } else if (principal.role === 'admin' || principal.role === 'support') {
      if (!principal.accountId) return loginFailure(request)
      session = createStaffSession(principal.role, principal.accountId, request)
    } else {
      const access = resolveSubbotPasskeyAccess(principal.subbotId, principal.userJid)
      if (!access) return loginFailure(request)
      session = createSubbotSession(access, request)
    }

    updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter)
    clearLoginFailures(request)

    const response = NextResponse.json({
      ok: true,
      redirect: session.role === 'subbot' ? '/subbot' : '/admin',
    }, { headers: { 'cache-control': 'no-store' } })

    if (session.role === 'subbot') {
      response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
      response.cookies.delete(ADMIN_SESSION_COOKIE)
    } else {
      response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
      response.cookies.delete(SUBBOT_SESSION_COOKIE)
    }
    return response
  } catch {
    return loginFailure(request)
  }
}
