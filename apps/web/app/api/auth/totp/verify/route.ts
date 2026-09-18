import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  PREAUTH_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createOwnerSession,
  createStaffSession,
  signSession,
  verifyPreauth,
} from '../../../../../lib/auth'
import {
  clearLoginFailures,
  principalHasVerifiedTotp,
  recordLoginFailure,
  requireSameOrigin,
  verifyTotpForPrincipal,
} from '../../../../../lib/web-security'

function invalid(request: Request, status = 400) {
  recordLoginFailure(request)
  return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status })
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
  } catch {
    return invalid(request)
  }

  const store = await cookies()
  const preauth = verifyPreauth(store.get(PREAUTH_COOKIE)?.value)
  if (!preauth) return invalid(request, 401)

  const body = await request.json().catch(() => ({})) as { code?: string }
  const principal = preauth.role === 'owner'
    ? { role: 'owner' as const }
    : { role: preauth.role, accountId: preauth.accountId }

  if (!principalHasVerifiedTotp(principal) || !verifyTotpForPrincipal(principal, String(body.code ?? ''))) {
    return invalid(request)
  }

  const session = principal.role === 'owner'
    ? createOwnerSession(request)
    : createStaffSession(principal.role, principal.accountId, request)

  clearLoginFailures(request)
  const response = NextResponse.json({ ok: true, redirect: '/admin' }, { headers: { 'cache-control': 'no-store' } })
  response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
  response.cookies.delete(SUBBOT_SESSION_COOKIE)
  response.cookies.delete(PREAUTH_COOKIE)
  return response
}
