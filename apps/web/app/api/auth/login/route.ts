import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createOwnerSession,
  createStaffSession,
  createSubbotSession,
  resolveSubbotPortalToken,
  signSession,
  verifyAdminToken,
} from '../../../../lib/auth'
import {
  clearLoginFailures,
  loginRateLimited,
  recordLoginFailure,
  requireSameOrigin,
  resolveStaffToken,
} from '../../../../lib/web-security'
import { publicUrl } from '../../../../lib/public-url'

function loginUrl(request: Request, error: string) {
  const url = publicUrl(request, '/login')
  url.searchParams.set('error', error)
  return url
}

function invalid(request: Request) {
  return NextResponse.redirect(loginUrl(request, 'invalid'), 303)
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
    const session = createOwnerSession(request)
    clearLoginFailures(request)
    const response = NextResponse.redirect(publicUrl(request, '/admin'), 303)
    response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  const staff = resolveStaffToken(token)
  if (staff) {
    const session = createStaffSession(staff.role, staff.id, request)
    clearLoginFailures(request)
    const response = NextResponse.redirect(publicUrl(request, '/admin'), 303)
    response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  const subbotAccess = resolveSubbotPortalToken(token)
  if (subbotAccess) {
    const session = createSubbotSession(subbotAccess, request)
    clearLoginFailures(request)
    const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
    response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    return response
  }

  recordLoginFailure(request)
  return invalid(request)
}
