import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createAdminSession,
  resolveSubbotPortalToken,
  signSession,
  verifyAdminToken,
} from '../../../../lib/auth'

function loginUrl(request: Request, mode: string, error: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('mode', mode)
  url.searchParams.set('error', error)
  return url
}

export async function POST(request: Request) {
  const form = await request.formData()
  const mode = String(form.get('mode') ?? '')
  const token = String(form.get('token') ?? '').trim()

  if (mode === 'admin') {
    if (!verifyAdminToken(token)) return NextResponse.redirect(loginUrl(request, 'admin', 'invalid'), 303)
    const session = createAdminSession()
    const response = NextResponse.redirect(new URL('/admin', request.url), 303)
    response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  if (mode === 'subbot') {
    const session = resolveSubbotPortalToken(token)
    if (!session) return NextResponse.redirect(loginUrl(request, 'subbot', 'invalid'), 303)
    const response = NextResponse.redirect(new URL('/subbot', request.url), 303)
    response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    return response
  }

  return NextResponse.redirect(loginUrl(request, 'admin', 'mode'), 303)
}
