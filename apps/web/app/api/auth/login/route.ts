import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  PREAUTH_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createOwnerSession,
  createPreauth,
  createStaffSession,
  createSubbotSession,
  preauthCookieOptions,
  resolveSubbotPortalToken,
  signPreauth,
  signSession,
  verifyAdminToken,
} from '../../../../lib/auth'
import { publicUrl } from '../../../../lib/public-url'
import {
  clearLoginFailures,
  listPasskeys,
  loginRateLimited,
  recordLoginFailure,
  requireSameOrigin,
  resolveStaffToken,
  subjectForPrincipal,
  privileged2faRequired,
} from '../../../../lib/web-security'

function loginUrl(request: Request, error: string) {
  const url = publicUrl(request, '/login')
  url.searchParams.set('error', error)
  return url
}

function invalid(request: Request) {
  return NextResponse.redirect(loginUrl(request, 'invalid'), 303)
}

function privilegedLogin(
  request: Request,
  principal: { role: 'owner'; accountId: 'owner' } | { role: 'admin' | 'support'; accountId: string },
) {
  const subject = subjectForPrincipal(principal)
  const hasSecondFactor = listPasskeys(subject).length > 0

  if (privileged2faRequired() && hasSecondFactor) {
    const preauth = createPreauth(principal.role, principal.accountId)
    const url = publicUrl(request, '/login')
    url.searchParams.set('mfa', '1')
    const response = NextResponse.redirect(url, 303)
    response.cookies.set(PREAUTH_COOKIE, signPreauth(preauth), preauthCookieOptions(preauth.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  const session = principal.role === 'owner'
    ? createOwnerSession(request)
    : createStaffSession(principal.role, principal.accountId, request)

  const target = publicUrl(request, '/admin')
  if (privileged2faRequired() && !hasSecondFactor) {
    target.searchParams.set('section', 'security')
    target.searchParams.set('enroll', '1')
  }

  const response = NextResponse.redirect(target, 303)
  response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
  response.cookies.delete(SUBBOT_SESSION_COOKIE)
  response.cookies.delete(PREAUTH_COOKIE)
  return response
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
  } catch {
    return invalid(request)
  }

  if (loginRateLimited(request)) return invalid(request)

  const form = await request.formData()
  const token = String(form.get('token') ?? '').trim()
  if (!token) {
    recordLoginFailure(request)
    return invalid(request)
  }

  if (verifyAdminToken(token)) {
    clearLoginFailures(request)
    return privilegedLogin(request, { role: 'owner', accountId: 'owner' })
  }

  const staff = resolveStaffToken(token)
  if (staff) {
    clearLoginFailures(request)
    return privilegedLogin(request, { role: staff.role, accountId: staff.id })
  }

  const subbotAccess = resolveSubbotPortalToken(token)
  if (subbotAccess) {
    const session = createSubbotSession(subbotAccess, request)
    clearLoginFailures(request)
    const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
    response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    response.cookies.delete(PREAUTH_COOKIE)
    return response
  }

  recordLoginFailure(request)
  return invalid(request)
}
